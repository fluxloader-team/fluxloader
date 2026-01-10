import { app, BrowserWindow, ipcMain, screen, shell, dialog } from "electron";
import path from "path";
import fs from "fs";
import process from "process";
import os from "os";
import { spawn } from "child_process";
import asar from "asar";
import url from "url";
import vm from "vm";
import { randomUUID } from "crypto";
import { marked } from "marked";
import { JSDOM } from "jsdom";
import dotenv from "dotenv";
import { EventBus, SchemaValidation, Logging, FluxloaderSemver, DependencyCalculator, successResponse, errorResponse, responseAsError } from "./common.js";
import semver from "semver";
import AdmZip from "adm-zip";
import Module from "module";

/** @typedef {import('./common.js').ModInfo} ModInfo */
/** @typedef {import('./common.js').Mod} Mod */
/** @typedef {import('./common.js').Mods} Mods */
/** @typedef {import('./common.js').Action} Action */
/** @typedef {import('./common.js').Actions} Actions */
/** @typedef {import('./common.js').FlResponse} FlResponse */
/** @typedef {import('./common.js').FetchedMod} FetchedMod */
/** @typedef {import('./common.js').FetchedModCache} FetchedModCache */

// =================== GENERAL ARCHITECTURE ===================

// Top level functions of classes / the fluxloader should not throw errors in cases where it is not catastrophic
// Instead use successResponse() or errorResponse() to return a response object
//
// - Low level file operations (like reading a file) can throw errors, but they should be caught and handled
// - Similarly, internal functions can throw errors as long as the interface functions catch and handle them
//
// Uncaught errors are caught and windows closed and cleaned up
// Its important to note more errors can occur afterwards so be wary with the cleanup code

// =================== VARIABLES ===================

globalThis.fluxloaderVersion = "2.4.1";
globalThis.gameElectronFuncs = undefined;
globalThis.semver = semver;
/** @type {GameWindow} */ globalThis.gameWindow = undefined;
/** @type {ElectronFluxloaderAPI} */ globalThis.fluxloaderAPI = undefined;

let logLevels = ["debug", "info", "warn", "error"];
let preConfigLogLevel = "debug";
let configPath = "fluxloader-config.json";
let configSchemaPath = "schema.fluxloader-config.json";
let modInfoSchemaPath = "schema.mod-info.json";
let latestLogFilePath = undefined;
let previousLogFilePath = undefined;
let config = undefined;
let configSchema = undefined;
let configLoaded = false;
let logsForManager = [];
let isGameStarted = false;
let isManagerStarted = false;
/** @type {ModsManager} */ let modsManager = undefined;
/** @type {GameFilesManager} */ let gameFilesManager = undefined;
/** @type {BrowserWindow} */ let managerWindow = undefined;

// =================== LOGGING ===================

function setupLogFile() {
	if (!configLoaded) return;

	if (latestLogFilePath) return;

	latestLogFilePath = resolvePathRelativeToExecutable(config.logging.latestLogFilePath);
	previousLogFilePath = resolvePathRelativeToExecutable(config.logging.previousLogFilePath);
	try {
		// Move all data from the latest log into the previous log if it exists
		if (fs.existsSync(latestLogFilePath)) {
			fs.writeFileSync(previousLogFilePath, fs.readFileSync(latestLogFilePath));
		}
		// Clear latest log
		fs.writeFileSync(latestLogFilePath, new Date().toISOString() + "\n");
	} catch (e) {
		throw new Error(`Error writing to log files: ${e.stack}`); // Config loading error is catastrophic for now
	}
	logDebug(`Fluxloader log path: ${latestLogFilePath}`);
}

globalThis.log = function (level, tag, message) {
	if (!logLevels.includes(level)) throw new Error(`Invalid log level: ${level}`);
	const timestamp = new Date();
	const header = Logging.logHead(timestamp, level, tag);
	const headerColoured = Logging.logHead(timestamp, level, tag, true);
	const levelIndex = logLevels.indexOf(level);

	// Only log to file if defined by the config and level is allowed
	if (configLoaded && config.logging.logToFile) {
		if (levelIndex >= logLevels.indexOf(config.logging.fileLogLevel)) {
			if (!latestLogFilePath) setupLogFile();
			fs.appendFileSync(latestLogFilePath, `${header} ${message}\n`);
		}
	}

	// If config is not loaded then use the pre-config log level as the filter
	// Otherwise only log to console based on config level and console log flag
	let consoleLevelLimit = preConfigLogLevel;
	if (configLoaded) consoleLevelLimit = config.logging.consoleLogLevel;
	if (!configLoaded || config.logging.logToConsole) {
		if (levelIndex >= logLevels.indexOf(consoleLevelLimit)) {
			console.log(`${headerColoured} ${message}`);
			forwardLogToManager({ source: "electron", timestamp, level, tag, message });
		}
	}
};

globalThis.logDebug = (...args) => log("debug", "", args.join(" "));
globalThis.logInfo = (...args) => log("info", "", args.join(" "));
globalThis.logWarn = (...args) => log("warn", "", args.join(" "));
globalThis.logError = (...args) => log("error", "", args.join(" "));

function forwardLogToManager(log) {
	logsForManager.push(log);
	trySendManagerEvent("fl:forward-log", log);
}

// =================== UTILTY ===================

function resolvePathRelativeToExecutable(name) {
	// If absolute then return the path as is
	if (path.isAbsolute(name)) return name;

	if (app.isPackaged) {
		// PORTABLE_EXECUTABLE_DIR is only defined in a portable windows build
		if (process.env.PORTABLE_EXECUTABLE_DIR) {
			return path.join(process.env.PORTABLE_EXECUTABLE_DIR, name);
		}
		// APPIMAGE is only defined in a portable linux build
		else if (process.env.APPIMAGE) {
			return path.join(path.dirname(process.env.APPIMAGE), name);
		}
		// Otherwise it must be standard electron-builder
		else {
			return path.join(path.dirname(process.execPath), name);
		}
	}
	// Running through electron
	else {
		return path.join(path.dirname(url.fileURLToPath(import.meta.url)), name);
	}
}

function resolvePathInsideFluxloader(name) {
	// If absolute then return the path as is
	if (path.isAbsolute(name)) return name;

	const moduleFilePath = url.fileURLToPath(import.meta.url);
	const fileDir = path.dirname(moduleFilePath);
	return path.join(fileDir, name);
}

function ensureDirectoryExists(dirPath) {
	// If this errors it is catastrophic
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
		logDebug(`Directory created: ${dirPath}`);
	}
}

function formatMarkdown(text, modname) {
	// Generates HTML from markdown and fixes relative image file paths
	let dom = new JSDOM(marked(text));
	let images = dom.window.document.querySelectorAll("img");
	for (const image of images) {
		image.src = image.src.startsWith(".") ? path.join(fluxloaderAPI.getModsPath(), modname, image.src) : image.src;
	}
	return dom.serialize();
}

// =================== MAIN ===================

class ElectronFluxloaderAPI {
	static allEvents = ["fl:mod-loaded", "fl:mod-unloaded", "fl:all-mods-loaded", "fl:game-started", "fl:game-closed", "fl:file-requested", "fl:config-changed", "fl:mod-config-changed", "fl:pre-scene-loaded"];
	environment = "electron";
	/** @type {EventBus?} */ events = undefined;
	/** @type {ElectronModConfigAPI?} */ modConfig = undefined;

	constructor() {
		this.events = new EventBus();
		this.modConfig = new ElectronModConfigAPI();
	}

	addPatch(file, patch) {
		if (!gameFilesManager) throw new Error("Cannot add patch before file manager is initialized");
		const tag = randomUUID();
		gameFilesManager.setPatch(file, tag, patch);
		return tag;
	}

	setPatch(file, tag, patch) {
		if (!gameFilesManager) throw new Error("Cannot set patch before file manager is initialized");
		gameFilesManager.setPatch(file, tag, patch);
	}

	addMappedPatch(fileMap, mapFunction) {
		if (!gameFilesManager) throw new Error("Cannot add mapped patch before file manager is initialized");
		const tag = randomUUID();
		gameFilesManager.setMappedPatch(fileMap, tag, mapFunction);
		return tag;
	}

	setMappedPatch(fileMap, tag, mapFunction) {
		if (!gameFilesManager) throw new Error("Cannot set mapped patch before file manager is initialized");
		gameFilesManager.setMappedPatch(fileMap, tag, mapFunction);
	}

	patchExists(file, tag) {
		if (!gameFilesManager) throw new Error("Cannot check patch before file manager is initialized");
		gameFilesManager.patchExists(file, tag);
	}

	removePatch(file, tag) {
		if (!gameFilesManager) throw new Error("Cannot remove patch before file manager is initialized");
		gameFilesManager.removePatch(file, tag);
	}

	repatchAllFiles() {
		if (!gameFilesManager) throw new Error("Cannot repatch all files before file manager is initialized");
		gameFilesManager.repatchAllFiles();
	}

	repatchFile(file) {
		if (!gameFilesManager) throw new Error("Cannot repatch file before file manager is initialized");
		gameFilesManager._repatchFile(file);
	}

	getGameBasePath() {
		if (!gameFilesManager) throw new Error("Cannot get game base path before file manager is initialized");
		return gameFilesManager.gameBasePath;
	}

	getGameAsarPath() {
		if (!gameFilesManager) throw new Error("Cannot get game asar path before file manager is initialized");
		return gameFilesManager.gameAsarPath;
	}

	getTempBasePath() {
		if (!gameFilesManager) throw new Error("Cannot get temp base path before file manager is initialized");
		return gameFilesManager.tempBasePath;
	}

	getTempExtractedPath() {
		if (!gameFilesManager) throw new Error("Cannot get temp extracted path before file manager is initialized");
		return gameFilesManager.tempExtractedPath;
	}

	getModsPath() {
		return modsManager.baseModsPath;
	}

	getUserDataPath() {
		return app.getPath("userData");
	}

	handleGameIPC(channel, handler) {
		const fullChannel = `mod:${channel}`;
		this._modIPCHandlers.push({ channel: fullChannel, handler });
		ipcMain.handle(fullChannel, handler);
	}

	sendGameEvent(event, message) {
		const fullEvent = `mod:${event}`;
		logDebug(`Sending game event: ${fullEvent} with message: ${JSON.stringify(message)}`);
		globalThis.gameWindow?.webContents.send(fullEvent, message);
	}

	getInstalledMods() {
		return modsManager.getInstalledMods();
	}

	getLoadedMods() {
		return modsManager.getLoadedMods();
	}

	getEnabledMods() {
		return modsManager.getEnabledMods();
	}

	// ------------ INTERNAL ------------

	_modIPCHandlers = [];

	_clearModIPCHandlers() {
		for (const handler of this._modIPCHandlers) {
			logDebug(`Removing IPC handler for channel: ${handler.channel}`);
			ipcMain.removeHandler(handler.channel);
		}
		this._modIPCHandlers = [];
	}

	_initializeEvents() {
		for (const event of ElectronFluxloaderAPI.allEvents) {
			this.events.registerEvent(event);
		}
	}
}

class ElectronModConfigAPI {
	constructor() {
		ipcMain.handle("fl:mod-config-get", (_, modID) => {
			logDebug(`Getting mod config remotely for ${modID}`);
			return this.get(modID);
		});

		ipcMain.handle("fl:mod-config-set", (_, modID, config) => {
			logDebug(`Setting mod config remotely for ${modID}`);
			return this.set(modID, config);
		});
	}

	get(modID) {
		const modIDPath = this.sanitizeModIDPath(modID);
		const baseModsPath = resolvePathRelativeToExecutable(config.modsPath);
		const modsConfigPath = path.join(baseModsPath, "config");
		ensureDirectoryExists(modsConfigPath);
		const modConfigPath = path.join(modsConfigPath, `${modIDPath}.json`);
		logDebug(`Getting mod config: ${modIDPath} -> ${modConfigPath}`);

		// If this fails treat it as catastrophic for now
		if (fs.existsSync(modConfigPath)) {
			return JSON.parse(fs.readFileSync(modConfigPath, "utf8"));
		} else {
			return {};
		}
	}

	set(modID, _config, ignoreSchema = false) {
		const modIDPath = this.sanitizeModIDPath(modID);
		const baseModsPath = resolvePathRelativeToExecutable(config.modsPath);
		const modsConfigPath = path.join(baseModsPath, "config");
		ensureDirectoryExists(modsConfigPath);
		const modConfigPath = path.join(modsConfigPath, `${modIDPath}.json`);
		logDebug(`Setting mod config: ${modIDPath} -> ${modConfigPath}`);

		if (!ignoreSchema) {
			// Silent fail if mod isn't installed, which shouldn't be the case *ever*
			if (!modsManager.installedMods.hasOwnProperty(modID)) return;
			const res = SchemaValidation.validate({ target: _config, schema: modsManager.installedMods[modID].info.configSchema, config: { unknownKeyMethod: "ignore" } });
			if (!res.success) return errorResponse(`Mod info schema validation failed when being set: (${res.source}) ${res.error.message}`);
		}

		// If this fails treat it as catastrophic for now
		fs.writeFileSync(modConfigPath, JSON.stringify(_config, null, 4), "utf8");

		fluxloaderAPI.events?.tryTrigger("fl:mod-config-changed", { modID, config: _config });

		return true;
	}

	sanitizeModIDPath(modID) {
		return modID;
	}
}

class GameFilesManager {
	/** @type {string?} */ gameBasePath = undefined;
	/** @type {string?} */ gameAsarPath = undefined;
	/** @type {string?} */ tempBasePath = undefined;
	/** @type {string?} */ tempExtractedPath = undefined;
	fileData = {};
	isTempInitialized = false;
	isGameExtracted = false;
	isGameModified = false;

	constructor(gameBasePath, gameAsarPath) {
		// The game base / asar path must be absolute and verified to exist
		this.gameBasePath = gameBasePath;
		this.gameAsarPath = gameAsarPath;
	}

	resetToBaseFiles() {
		logDebug("Resetting game files to unmodified state using app.asar");

		// Do not need to reset if we are extracted and not modified
		if (this.isGameExtracted && !this.isGameModified) return successResponse("Game files are already in unmodified state");

		try {
			// Ensure we have a temp directory
			if (!this.isTempInitialized) {
				this._createTempDirectory();
			}

			// Ensure the game is extracted
			if (!this.isGameExtracted) {
				this._extractAllFiles();
			}

			// If the files are modified then reset them to the original
			else if (this.isGameModified) {
				for (const file in this.fileData) {
					this._resetFileToBase(file);
				}
			}
		} catch (e) {
			return errorResponse(`Failed to reset game files to unmodified state: ${e.stack}`);
		}

		logDebug("Extracted game files reset to unmodified state");
		return successResponse("Extracted game files reset to unmodified state");
	}

	clearPatches() {
		logDebug("Clearing all patches from game files");

		// This is not modifying the files, just clearing the in-memory patches
		for (const file in this.fileData) {
			this.fileData[file].patches.clear();
			this.fileData[file].usingLatestPatches = false;
		}
	}

	setPatch(file, tag, patch) {
		if (!this.isGameExtracted) return errorResponse("Game files not extracted yet cannot set patch");

		if (!this.fileData[file]) {
			try {
				this._initializeFileData(file);
			} catch (e) {
				return errorResponse(`Failed to initialize file data for '${file}' when setting patch '${tag}'`);
			}
		}

		logDebug(`Setting patch '${tag}' in file: ${file}`);
		this.fileData[file].patches.set(tag, patch);
		this.fileData[file].usingLatestPatches = false;
		return successResponse(`Patch '${tag}' set in file: ${file}`);
	}

	setMappedPatch(fileMap, tag, mapFunction) {
		if (!this.isGameExtracted) return errorResponse("Game files not extracted yet cannot set mapped patch");

		logDebug(`Setting mapped patch '${tag}' in file(s): ${Object.keys(fileMap)}`);
		for (const [file, variables] of Object.entries(fileMap)) {
			if (!this.fileData[file]) {
				try {
					this._initializeFileData(file);
				} catch (e) {
					return errorResponse(`Failed to initialize file data for '${file}' when setting mapped patch '${tag}'`);
				}
			}
			this.fileData[file].patches.set(tag, mapFunction(...variables));
			this.fileData[file].usingLatestPatches = false;
		}
		return successResponse(`Mapped patch '${tag}' set in file(s): ${Object.keys(fileMap)}`);
	}

	patchExists(file, tag) {
		if (!this.isGameExtracted) return false;
		if (!this.fileData[file]) return false;
		return this.fileData[file].patches.has(tag);
	}

	removePatch(file, tag) {
		if (!this.isGameExtracted) return errorResponse("Game files not extracted yet cannot remove patch");

		if (!this.fileData[file]) {
			try {
				this._initializeFileData(file);
			} catch (e) {
				return errorResponse(`Failed to initialize file data for '${file}' when removing patch '${tag}': ${e.stack}`);
			}
		}

		if (!this.fileData[file].patches.has(tag)) {
			return successResponse(`Patch '${tag}' does not exist for file: ${file}`);
		}

		logDebug(`Removing patch '${tag}' from file: ${file}`);
		this.fileData[file].patches.delete(tag);
		this.fileData[file].usingLatestPatches = false;
		return successResponse(`Patch '${tag}' removed from file: ${file}`);
	}

	repatchAllFiles() {
		if (!this.isGameExtracted) return errorResponse("Game files not extracted yet cannot repatch all");
		logDebug("Repatching all files...");
		for (const file in this.fileData) {
			try {
				this._repatchFile(file);
			} catch (e) {
				logError(`Failed to repatch file '${file}': ${e.stack}`);
				return errorResponse(`Failed to repatch file '${file}': ${e.message}`);
			}
		}
		logInfo("All game files repatched successfully");
		return successResponse("All game files repatched successfully");
	}

	async patchAndRunGameElectron() {
		if (!this.isGameExtracted) return errorResponse("Game files not extracted cannot process game app");
		logInfo("Patching and running game electron files...");

		// Here we basically want to isolate createWinow(), setupIpcHandlers(), and loadSettingsSync()
		// This is potentially very brittle and may need fixing in the future if main.js changes
		// We need to disable the default app listeners (so they're not ran when we run eval(...))
		// The main point is we want to ensure we open the game the same way the game does

		try {
			const setPatchMain = (tag, from, to, matches = 1) => {
				const res = gameFilesManager.setPatch("main.js", tag, { type: "replace", from, to, expectedMatches: matches });
				if (!res.success) throw new Error(`Failed to set patch for main.js: ${res.message}`);
			};
			const setPatchPreload = (tag, from, to, matches = 1) => {
				const res = gameFilesManager.setPatch("preload.js", tag, { type: "replace", from, to, expectedMatches: matches });
				if (!res.success) throw new Error(`Failed to set patch for main.js: ${res.message}`);
			};

			// Rename and expose the games main electron functions
			setPatchMain("fluxloader:electron-globalize-main", "function createWindow ()", "globalThis.gameElectronFuncs.createWindow = function()");
			setPatchMain("fluxloader:electron-globalize-ipc", "function setupIpcHandlers()", "globalThis.gameElectronFuncs.setupIpcHandlers = function()");
			setPatchMain("fluxloader:electron-globalize-settings", "function loadSettingsSync()", "globalThis.gameElectronFuncs.loadSettingsSync = function()");
			setPatchMain("fluxloader:electron-globalize-settings-calls", "loadSettingsSync()", "globalThis.gameElectronFuncs.loadSettingsSync()");

			// Block the automatic app listeners so we control when things happen
			setPatchMain("fluxloader:electron-block-execution-1", "app.whenReady().then(() => {", "var _ = (() => {");
			setPatchMain("fluxloader:electron-block-execution-2", "app.on('window-all-closed', function () {", "var _ = (() => {");

			// Ensure that the app thinks it is still running inside the app.asar
			// - Fix the userData path to be 'sandustrydemo' instead of 'sandustry-fluxloader'
			// - Override relative "preload.js" to absolute
			// - Override relative "index.html" to absolute
			setPatchMain("fluxloader:electron-fix-paths-1", 'getPath("userData")', 'getPath("userData").replace("sandustry-fluxloader", "sandustrydemo")', 3);
			setPatchMain("fluxloader:electron-fix-paths-2", "path.join(__dirname, 'preload.js')", `'${path.join(this.tempExtractedPath, "preload.js").replaceAll("\\", "/")}'`);
			setPatchMain("fluxloader:electron-fix-paths-3", "loadFile('index.html')", `loadFile('${path.join(this.tempExtractedPath, "index.html").replaceAll("\\", "/")}')`);

			// Expose the games main window to be global
			setPatchMain("fluxloader:electron-globalize-window", "const mainWindow", "globalThis.gameWindow", 1);
			setPatchMain("fluxloader:electron-globalize-window-calls", "mainWindow", "globalThis.gameWindow", 4);

			// Make the menu bar visible
			// replaceAllMain("autoHideMenuBar: true,", "autoHideMenuBar: false,");

			// We're also gonna expose the ipcMain in preload.js
			setPatchPreload(
				"fluxloader:exposeIPC",
				"save: (id, name, data)",
				`invoke: (msg, ...args) => ipcRenderer.invoke(msg, ...args),
				handle: (msg, func) => ipcRenderer.handle(msg, func),
				on: (msg, func) => ipcRenderer.on(msg, func),
				save: (id, name, data)`,
			);

			// Hook into the debugger
			setPatchMain("fluxloader:attach-debugger", "globalThis.gameWindow.loadFile", "globalThis.attachDebuggerToGameWindow(globalThis.gameWindow);globalThis.gameWindow.loadFile");

			gameFilesManager._repatchFile("main.js");
			gameFilesManager._repatchFile("preload.js");
		} catch (e) {
			return errorResponse(`Failed to patch game electron files: ${e.message}`);
		}

		// We want to run the patches main.js everytime here to register the functions to the global gameElectronFuncs object
		// Currently this does not work well due to dynamic import() query string cache invalidation not working on files that have require() inside of them
		// Therefore main.js will only be evaluated once on the first run and not again after that due to nodes aggressive caching
		// This means if mods try and change main.js (which they shouldn't) and that changes between executions of the game it will not work
		const hasAlreadyRan = gameElectronFuncs && Object.keys(gameElectronFuncs).length > 0;
		if (hasAlreadyRan) {
			logDebug("Game electron functions already initialized");
			return successResponse("Game electron functions already initialized");
		}

		// Assuming this is the first time, run the modified main.js to register the functions
		gameElectronFuncs = {};
		try {
			const mainPath = path.join(this.tempExtractedPath, "main.js");
			const gameElectronURL = `file://${mainPath}`;
			logDebug(`Executing modified games electron main.js: ${gameElectronURL}`);
			await import(gameElectronURL);
		} catch (e) {
			return errorResponse(`Error evaluating game main.js: ${e.stack}`);
		}

		// Ensure it worked correctly
		let requiredFunctions = ["createWindow", "setupIpcHandlers", "loadSettingsSync"];
		for (const func of requiredFunctions) {
			if (!Object.hasOwn(gameElectronFuncs, func)) {
				return errorResponse(`Game electron function '${func}' is not defined after evaluation`);
			}
		}

		// Now run the setupIpcHandlers() function to register the ipcMain handlers
		// Again, we should only do this once, so this code relies on that fact otherwise the handlers will be registered multiple times and error
		try {
			logDebug("Calling games electron setupIpcHandlers()");
			gameElectronFuncs.setupIpcHandlers();
		} catch (e) {
			return errorResponse(`Error calling game electron setupIpcHandlers(): ${e.stack}`);
		}

		logDebug("Game electron functions initialized successfully");
		return successResponse("Game electron functions initialized successfully");
	}

	deleteFiles() {
		logDebug("Deleting game files...");
		let success = true;
		try {
			this._deleteTempDirectory();
		} catch (e) {
			success = false;
		}
		this.fileData = {};
		this.tempBasePath = undefined;
		this.tempExtractedPath = undefined;
		this.isTempInitialized = false;
		this.isGameExtracted = false;
		this.isGameModified = false;
		if (!success) {
			return errorResponse(`Failed to delete game files: ${e.stack}`);
		} else {
			return successResponse("Game files deleted successfully");
		}
	}

	ensureFilePatchesUpToDate(file) {
		if (!this.isGameExtracted) return errorResponse("Game files not extracted yet cannot ensure file patches up to date");

		file = file.replace(/\\/g, "/");

		if (!this.fileData[file]) return;

		if (this.fileData[file].usingLatestPatches) {
			logDebug(`File '${file}' is already using the latest patches`);
			return successResponse(`File '${file}' is already using the latest patches`);
		}

		logDebug(`Repatching file '${file}' to ensure it is up to date with the latest patches`);

		try {
			this._repatchFile(file);
		} catch (e) {
			return errorResponse(`Failed to ensure file patches up to date for '${file}': ${e.stack}`);
		}

		return successResponse(`File '${file}' re-patched to the latest patches`);
	}

	static deleteOldTempDirectories() {
		logDebug("Deleting old temp directories...");
		let basePath;
		let files;
		try {
			basePath = os.tmpdir();
			files = fs.readdirSync(basePath);
		} catch (e) {
			return errorResponse(`Error reading temp directory: ${e.stack}`);
		}
		for (const file of files) {
			try {
				if (file.startsWith("sandustry-fluxloader-")) {
					const fullPath = path.join(basePath, file);
					logDebug(`Deleting old temp directory: ${fullPath}`);
					fs.rmSync(fullPath, { recursive: true });
				}
			} catch (e) {
				return errorResponse(`Error deleting old temp directory: ${e.stack}`);
			}
		}
		return successResponse("Old temp directories deleted successfully");
	}

	// ------------ INTERNAL ------------

	_createTempDirectory() {
		if (this.isTempInitialized) throw new Error("Temp directory already initialized");

		const newTempBasePath = path.join(os.tmpdir(), `sandustry-fluxloader-${Date.now()}`);
		logDebug(`Creating game files temp directory: ${newTempBasePath}`);
		ensureDirectoryExists(newTempBasePath);
		this.tempBasePath = newTempBasePath;
		this.isTempInitialized = true;
		this.isGameExtracted = false;
		this.isGameModified = false;
	}

	_deleteTempDirectory() {
		if (!this.isTempInitialized) return;
		logDebug(`Deleting temp directory: ${this.tempBasePath}`);
		try {
			fs.rmSync(this.tempBasePath, { recursive: true });
		} catch (e) {
			throw new Error(`Failed to delete temp directory ${this.tempBasePath}: ${e.stack}`);
		}
		logDebug(`Temp directory deleted: ${this.tempBasePath}`);
		this.tempBasePath = undefined;
		this.isTempInitialized = false;
	}

	_extractAllFiles() {
		if (!this.isTempInitialized) throw new Error("Temp directory not initialized yet cannot extract files");
		if (this.isGameExtracted) throw new Error("Game files already extracted");

		this.tempExtractedPath = path.join(this.tempBasePath, "extracted");
		ensureDirectoryExists(this.tempExtractedPath);
		logDebug(`Extracting game.asar to ${this.tempExtractedPath}`);
		try {
			asar.extractAll(this.gameAsarPath, this.tempExtractedPath);
		} catch (e) {
			throw new Error(`Error extracting game.asar: ${e.stack}`);
		}
		logDebug(`Successfully extracted app.asar to ${this.tempExtractedPath}`);
		this.isGameExtracted = true;
		this.isGameModified = false;
	}

	_initializeFileData(file) {
		if (!this.isGameExtracted) throw new Error(`Game files not extracted yet cannot initialize file: ${file}`);
		if (this.fileData[file]) throw new Error(`File already initialized: ${file}`);

		logDebug(`Initializing file data: ${file}`);
		const fullPath = path.join(this.tempExtractedPath, file);
		if (!fs.existsSync(fullPath)) {
			throw new Error(`File not found: ${fullPath}`);
		}
		this.fileData[file] = { fullPath, isModified: false, usingLatestPatches: false, patches: new Map() };
	}

	_repatchFile(file) {
		if (!this.isGameExtracted) throw new Error("Game files not extracted yet cannot repatch");
		if (!this.fileData[file]) throw new Error(`File not initialized: ${file}`);
		logDebug(`Repatching file: ${file}`);
		this._resetFileToBase(file);
		this._patchFile(file);
	}

	_resetFileToBase(file) {
		if (!this.isGameExtracted) throw new Error("Game files not extracted yet cannot reset file");
		if (!this.isGameModified) return;
		if (!this.fileData[file]) throw new Error(`File not initialized ${file} cannot reset`);
		if (!this.fileData[file].isModified) return;

		logDebug(`Resetting file: ${file}`);

		try {
			// Delete existing file
			const fullPath = this.fileData[file].fullPath;
			logDebug(`Deleting modified file: ${fullPath}`);
			fs.rmSync(fullPath);

			// Copy the original from the asar
			const asarFilePath = path.join(this.gameAsarPath, file);
			logDebug(`Copying original file from asar: ${asarFilePath} to ${fullPath}`);
			fs.copyFileSync(asarFilePath, fullPath);
		} catch (e) {
			throw new Error(`Error resetting file: ${e.stack}`);
		}

		this.fileData[file].isModified = false;
		this.fileData[file].usingLatestPatches = false;
		this.isGameModified = Object.values(this.fileData).some((f) => f.isModified);
	}

	_patchFile(file) {
		if (!this.isGameExtracted) throw new Error("Game files not extracted yet cannot apply patches");
		if (!this.fileData[file]) throw new Error(`File not initialized ${file} cannot apply patches`);
		if (this.fileData[file].isModified) throw new Error(`File already modified: ${file}`);

		if (this.fileData[file].patches.size === 0) {
			logDebug(`No patches to apply for file: ${file}`);
			return;
		}

		if (this.fileData[file].usingLatestPatches) {
			logDebug(`File '${file}' is already using the latest patches, no need to apply again`);
			return;
		}

		const fullPath = this.fileData[file].fullPath;
		logInfo(`Applying ${this.fileData[file].patches.size} patches to file: ${fullPath}`);

		let fileContent;
		try {
			fileContent = fs.readFileSync(fullPath, "utf8");
		} catch (e) {
			throw new Error(`Error reading file: ${fullPath}`);
		}

		for (const patch of this.fileData[file].patches.values()) {
			fileContent = this._applyPatchToContent(fileContent, patch);
		}

		logDebug(`Writing patched content back to file: ${fullPath}`);

		try {
			fs.writeFileSync(fullPath, fileContent, "utf8");
		} catch (e) {
			throw new Error(`Error writing patched content to file: ${fullPath}`);
		}

		this.fileData[file].isModified = true;
		this.fileData[file].usingLatestPatches = true;
		this.isGameModified = true;
	}

	_applyPatchToContent(fileContent, patch) {
		logDebug(`Applying patch: ${JSON.stringify(patch)}`);

		// Replaces matches of the regex with the replacement string
		switch (patch.type) {
			case "regex": {
				if (!Object.hasOwn(patch, "pattern") || !Object.hasOwn(patch, "replace")) {
					throw new Error(`Failed to apply regex patch. Missing "pattern" or "replace" field.`);
				}
				const regex = new RegExp(patch.pattern, "g");
				const matches = fileContent.match(regex);
				let expectedMatches = patch.expectedMatches || 1;
				if (expectedMatches > 0) {
					let actualMatches = matches ? matches.length : 0;
					if (actualMatches != expectedMatches) {
						throw new Error(`Failed to apply regex patch: "${patch.pattern}" -> "${patch.replace}", ${actualMatches} != ${expectedMatches} match(s).`);
					}
				}
				fileContent = fileContent.replace(regex, patch.replace);
				break;
			}

			// Run the function over the patch
			case "process": {
				fileContent = patch.func(fileContent);
				break;
			}

			case "overwrite": {
				if (!patch.contents && !patch.file) throw new Error("Failed to apply overwrite patch. Missing 'contents' or 'file' field.");
				fileContent = patch.contents || fs.readFileSync(patch.file);
				break;
			}

			// Replace all instances of the string with the replacement string
			case "replace": {
				if (!Object.hasOwn(patch, "from") || !Object.hasOwn(patch, "to")) {
					throw new Error(`Failed to apply replace patch. Missing "from" or "to" field.`);
				}
				let to = patch.to;
				if (Object.hasOwn(patch, "token")) {
					if (!to.includes(patch.token)) {
						logWarn(`Patch 'to' string does not include the specified token '${patch.token}'`);
					}
					to = to.replaceAll(patch.token, patch.from);
				}
				let actualMatches = 0;
				let searchIndex = 0;
				while (true) {
					const index = fileContent.indexOf(patch.from, searchIndex);
					if (index === -1) break;
					actualMatches++;
					searchIndex = index + patch.from.length;
				}
				let expectedMatches = patch.expectedMatches || 1;
				if (expectedMatches > 0) {
					if (actualMatches != expectedMatches) {
						throw new Error(`Failed to apply replace patch: "${patch.from}" -> "${patch.to}", ${actualMatches} != ${expectedMatches} match(s).`);
					}
				}
				if (actualMatches > 0) {
					fileContent = fileContent.split(patch.from).join(to);
				}
				break;
			}
		}

		return fileContent;
	}
}

class ModsManager {
	/** @type {string?} */ baseModsPath = undefined;
	modInfoSchema = undefined;
	/** @type {Mods} */ installedMods = {};
	loadOrder = [];
	areAnyModsLoaded = false;
	modContext = undefined;
	isPerformingActions = false;
	loadedModCount = 0;
	modScriptsImport = {};
	modElectronModules = {};
	/** @type {FetchedModCache} */ fetchedModCache = {};

	// ------------ MAIN ------------

	async reloadInstalledMods() {
		if (this.isPerformingActions) return errorResponse("Cannot find installed mods while performing actions");

		this.installedMods = {};
		this.loadOrder = [];
		this.loadedModCount = 0;

		// We also want to reset the mod dependencies
		this.fetchedModCache = {};

		this.baseModsPath = resolvePathRelativeToExecutable(config.modsPath);
		try {
			ensureDirectoryExists(this.baseModsPath);
		} catch (e) {
			return errorResponse(`Failed to ensure mods directory exists: ${e.stack}`);
		}

		// Find all the folders in the back directory and treat each as a mod
		let modPaths = fs.readdirSync(this.baseModsPath);
		modPaths = modPaths.filter((p) => p !== "config");
		modPaths = modPaths.map((p) => path.join(this.baseModsPath, p));
		modPaths = modPaths.filter((p) => fs.statSync(p).isDirectory());

		logDebug(`Found ${modPaths.length} mod${modPaths.length === 1 ? "" : "s"} to initialize inside: ${this.baseModsPath}`);

		for (const modPath of modPaths) {
			try {
				// Try and initialize the mod and its scripts
				const res = await this._initializeMod(modPath);
				if (!res.success) {
					logError(`Failed to initialize mod at '${modPath}': ${res.message}, ignoring...`);
					continue;
				}

				const { scripts, mod } = res.data;
				this.installedMods[mod.info.modID] = mod;
				this.modScriptsImport[mod.info.modID] = scripts;

				// Check if the mod is disabled in the config
				mod.isEnabled = true;
				if (Object.hasOwn(config.modsEnabled, mod.info.modID) && !config.modsEnabled[mod.info.modID]) {
					logDebug(`Mod '${mod.info.modID}' is disabled in the config`);
					mod.isEnabled = false;
				}
			} catch (e) {
				logError(`Error when initializing mod at path ${modPath}: ${e.stack}, this should have already been caught`);
				continue;
			}
		}

		this._updateLoadOrder();

		this._applyModsScriptModifySchema();

		// Final report of installed mods
		const modCount = Object.keys(this.installedMods).length;
		const modListMessage = this.loadOrder.map((modID) => `${!this.installedMods[modID].isEnabled ? "(DISABLED) " : ""}${this.installedMods[modID].info.modID} (v${this.installedMods[modID].info.version})`).join(", ");
		logInfo(`Successfully initialized ${modCount} mod${modCount == 1 ? "" : "s"}: [${modListMessage}]`);

		return successResponse(`Found ${modCount} mod${modCount == 1 ? "" : "s"}`);
	}

	async loadAllMods() {
		if (this.isPerformingActions) return errorResponse("Cannot load all mods while performing actions");
		if (this.areAnyModsLoaded) return errorResponse("Cannot load mods, some mods are already loaded");

		this._applyModsScriptModifySchema();

		const enabledCount = this.loadOrder.filter((modID) => this.installedMods[modID].isEnabled).length;
		if (enabledCount == this.loadOrder.length) {
			logInfo(`Loading ${this.loadOrder.length} mods...`);
		} else {
			logInfo(`Loading ${enabledCount} / ${this.loadOrder.length} mods...`);
		}

		// Verify dependencies of all mods before starting to load them
		const res = this.verifyDependencies();
		if (!res.success) return errorResponse(`Failed to verify dependencies`);

		// Setup the context for the mods and expose whatever they need to access
		try {
			this.modContext = vm.createContext({ fluxloaderAPI, log, fs, path, randomUUID, url, process, setTimeout, setInterval, clearTimeout, clearInterval });
		} catch (e) {
			return errorResponse(`Failed to create mod context: ${e.stack}`);
		}

		for (const modID of this.loadOrder) {
			if (this.installedMods[modID].isEnabled) {
				const res = await this._loadMod(this.installedMods[modID]);
				if (!res.success) return errorResponse(`Failed to load mod ${modID}: ${res.message}`);
				this.areAnyModsLoaded = true;
			}
		}

		fluxloaderAPI.events.trigger("fl:all-mods-loaded");
		logDebug(`All mods loaded successfully`);
		return successResponse(`Loaded ${this.loadedModCount} mod${this.loadedModCount == 1 ? "" : "s"}`);
	}

	async unloadAllMods() {
		if (this.isPerformingActions) return errorResponse("Cannot unload all mods while performing actions");
		if (!this.areAnyModsLoaded) {
			logWarn("No mods are currently loaded, nothing to unload");
			return successResponse("No mods are currently loaded, nothing to unload");
		}

		logDebug("Unloading all mods...");
		for (const modID of this.loadOrder) {
			if (this.installedMods[modID].isLoaded) {
				await this._unloadMod(this.installedMods[modID]);
			}
		}

		this.areAnyModsLoaded = false;
		this.modContext = undefined;
		this.loadedModCount = 0;
		this.modScriptsImport = {};
		this.modElectronModules = {};

		// Mods also have side effects on game files, IPC handlers, and events
		gameFilesManager.clearPatches();
		fluxloaderAPI._clearModIPCHandlers();
		logDebug("All mods unloaded successfully");
		return successResponse("All mods unloaded successfully");
	}

	async fetchRemoteMods(config) {
		// Construct query for search, page, and size, regex, and tags
		let query = { $and: [] };
		if (config.search) {
			query["$and"].push({
				$or: [{ "modData.name": { $regex: config.search, $options: "i" } }, { "modData.author": { $regex: config.search, $options: "i" } }, { "modData.shortDescription": { $regex: config.search, $options: "i" } }],
			});
		}
		if (config.tags && config.tags.length > 0) {
			query["$and"].push({ "modData.tags": { $all: config.tags } });
		}
		if (query["$and"].length == 0) {
			query = { "modData.name": { $regex: "", $options: "i" } };
		}
		logDebug(`Fetching remote mods with query: ${JSON.stringify(query)}`);
		const encodedQuery = encodeURIComponent(JSON.stringify(query));
		const url = `https://fluxloader.app/api/mods?search=${encodedQuery}&verified=null&page=${config.page}&size=${config.pageSize}`;

		// Request the remote mods from the API
		let responseData;
		let timeTaken;
		try {
			const listStart = Date.now();
			const response = await fetch(url);
			responseData = await response.json();
			const listEnd = Date.now();
			timeTaken = listEnd - listStart;
		} catch (e) {
			return errorResponse(`Failed to fetch mods from the API: ${e.stack}`);
		}

		// Check it is a valid response
		if (!responseData) return errorResponse("Invalid response from remote mods API");
		if (responseData.message && responseData.message === "No mods found matching your search query.") {
			logWarn(`No mods found for ${url}`);
			return successResponse("No remote mods found for the given query", []);
		}
		if (!Object.hasOwn(responseData, "resultsCount")) {
			return errorResponse("Invalid response from remote mods API, missing 'resultsCount'");
		}

		logDebug(`Fetched ${responseData.mods.length} remote mods from API in ${timeTaken}ms`);

		// Render the description of each mod if requested
		if (config.rendered) {
			const renderStart = Date.now();
			for (const modEntry of responseData.mods) {
				if (modEntry.modData && modEntry.modData.description) {
					modEntry.renderedDescription = formatMarkdown(modEntry.modData.description, modEntry.modID);
				} else {
					modEntry.renderedDescription = "";
				}
			}
			const renderEnd = Date.now();
			logDebug(`Rendered ${responseData.mods.length} descriptions for remote mods in ${renderEnd - renderStart}ms`);
		}

		// Cache the fetched mods
		for (const mod of responseData.mods) this.fetchedModCache[mod.modID] = mod;

		logDebug(`Returning ${responseData.mods.length} total mods for page ${config.page} of size ${config.pageSize} (${responseData.resultsCount} total)`);
		return successResponse(`Fetched ${responseData.mods.length} remote mods`, responseData.mods);
	}

	async fetchRemoteMod(config) {
		// If it is cached then return that
		if (this.fetchedModCache[config.modID]) {
			logDebug(`Returning cached mod info for '${config.modID}'`);
			return successResponse(`Returning cached mod info for '${config.modID}'`, this.fetchedModCache[config.modID]);
		}

		const url = `https://fluxloader.app/api/mods?option=info&modid=${config.modID}`;
		logDebug(`Fetching remote mod info from API: ${url}`);

		// Request the mod info from the API
		let responseData;
		try {
			const start = Date.now();
			const response = await fetch(url);
			responseData = await response.json();
			const end = Date.now();
			const timeTaken = end - start;
			logDebug(`Fetched mod '${config.modID}' from API in ${timeTaken}ms`);
		} catch (e) {
			return errorResponse(`Failed to fetch mod info from API: ${e.stack}`, {
				errorModID: config.modID,
				errorReason: "mod-info-fetch",
			});
		}

		// Check it is a valid response
		if (!responseData || !Object.hasOwn(responseData, "mod")) {
			return errorResponse(`Invalid response from remote mod API for mod '${config.modID}'`, {
				errorModID: config.modID,
				errorReason: "mod-info-fetch",
			});
		}
		const mod = responseData.mod;
		if (!Object.hasOwn(mod, "modData")) {
			return errorResponse(`Invalid response from remote mod API for mod '${config.modID}', missing 'modData'`, {
				errorModID: config.modID,
				errorReason: "mod-info-fetch",
			});
		}

		// Render the description if requested
		if (config.rendered && mod.modData.description) {
			try {
				mod.renderedDescription = formatMarkdown(mod.modData.description, mod.modID);
			} catch (e) {
				return errorResponse(`Failed to render mod description for mod '${config.modID}': ${e.stack}`, {
					errorModID: config.modID,
					errorReason: "mod-description-render",
				});
			}
		} else {
			mod.renderedDescription = "";
		}

		// Cache the fetched mod
		this.fetchedModCache[mod.modID] = mod;

		logDebug(`Returning mod info for '${config.modID}'`);
		return successResponse(`Fetched mod info for '${config.modID}'`, mod);
	}

	async createNewMod(modCreateRequestData) {
		// Assume that the data adheres to the modCreateRequestSchema
		try {
			// Check the modID is unique
			if (this.installedMods[modCreateRequestData.modID] || this.fetchedModCache[modCreateRequestData.modID]) {
				return errorResponse(`Mod with ID '${modCreateRequestData.modID}' already exists, please choose a different ID`);
			}

			// Create the mod directory
			const modPath = path.join(this.baseModsPath, modCreateRequestData.modID);
			logDebug(`Creating new mod directory at: ${modPath}`);
			if (fs.existsSync(modPath)) {
				return errorResponse(`Mod directory already exists at '${modPath}', please choose a different ID`);
			}
			ensureDirectoryExists(modPath);

			// Create the modinfo.json file
			const modInfo = {
				modID: modCreateRequestData.modID,
				name: modCreateRequestData.name,
				version: modCreateRequestData.version,
				author: modCreateRequestData.author,
				fluxloaderVersion: modCreateRequestData.fluxloaderVersion,
				shortDescription: modCreateRequestData.shortDescription,
				description: modCreateRequestData.description,
				dependencies: {},
				tags: [],
			};
			if (modCreateRequestData.electronEntrypointEnabled) modInfo.electronEntrypoint = modCreateRequestData.electronEntrypointName;
			if (modCreateRequestData.gameEntrypointEnabled) modInfo.gameEntrypoint = modCreateRequestData.gameEntrypointName;
			if (modCreateRequestData.workerEntrypointEnabled) modInfo.workerEntrypoint = modCreateRequestData.workerEntrypointName;
			if (modCreateRequestData.scriptEnabled) modInfo.scriptPath = modCreateRequestData.scriptPath;

			// Helper function to create a file with optional content
			function createFile(filePath, content = "") {
				logDebug(`Creating file at: ${filePath}`);
				try {
					fs.writeFileSync(filePath, content, "utf8");
				} catch (e) {
					return errorResponse(`Failed to create file at ${filePath}: ${e.stack}`);
				}
			}

			// Try create the modinfo.json file
			const modInfoPath = path.join(modPath, "modinfo.json");
			const modInfoResult = createFile(modInfoPath, JSON.stringify(modInfo, null, 2));
			if (modInfoResult && !modInfoResult.success) return modInfoResult;

			// Try create each entrypoint
			if (modCreateRequestData.electronEntrypointEnabled) {
				const electronEntrypointPath = path.join(modPath, modCreateRequestData.electronEntrypointName);
				const res = createFile(electronEntrypointPath);
				if (res && !res.success) return res;
			}
			if (modCreateRequestData.gameEntrypointEnabled) {
				const gameEntrypointPath = path.join(modPath, modCreateRequestData.gameEntrypointName);
				const res = createFile(gameEntrypointPath);
				if (res && !res.success) return res;
			}
			if (modCreateRequestData.workerEntrypointEnabled) {
				const workerEntrypointPath = path.join(modPath, modCreateRequestData.workerEntrypointName);
				const res = createFile(workerEntrypointPath);
				if (res && !res.success) return res;
			}
			if (modCreateRequestData.scriptEnabled) {
				const scriptPath = path.join(modPath, modCreateRequestData.scriptPath);
				const res = createFile(scriptPath);
				if (res && !res.success) return res;
			}
			return successResponse(`Mod '${modCreateRequestData.modID}' created successfully`);
		} catch (e) {
			return errorResponse(`Failed to create new mod: ${e.stack}`);
		}
	}

	setIsLoadOrderManual(isManual) {
		config.isLoadOrderManual = isManual;
		if (!isManual) config.loadOrder = [];
		updateFluxloaderConfig();
		this._updateLoadOrder();
	}

	setManualLoadOrder(loadOrder) {
		logDebug(`Setting manual load order: [${loadOrder.join(", ")}]`);
		config.loadOrder = loadOrder;
		updateFluxloaderConfig();
		this._updateLoadOrder();
	}

	async calculateModActions(/** @type {Actions} */ mainActions) {
		return await DependencyCalculator.calculate(this.installedMods, mainActions, this.fetchedModCache);
	}

	async performModActions(/** @type {Actions} */ allActions) {
		logDebug(`Performing ${Object.keys(allActions).length} mod action(s)`);

		if (this.isPerformingActions) return errorResponse("Already performing mod actions, cannot perform again");

		const install = async (modID, version) => {
			// Check if the mod is already installed
			if (this.installedMods[modID]) {
				const installedMod = this.installedMods[modID];

				if (installedMod.info.version === version) {
					logDebug(`Mod '${modID}' is already installed with version '${version}'`);
					return successResponse(`Mod '${modID}' is already installed with version '${version}'`);
				}

				return errorResponse(`Mod '${modID}' is already installed with different version '${installedMod.info.version}'`, {
					performedActions: performedActions,
					errorModID: modID,
					errorReason: "already-installed",
				});
			}

			// Fetch the mod version from the API
			const versionURL = `https://fluxloader.app/api/mods?option=download&modid=${modID}&version=${version}`;
			let versionRes;
			try {
				logDebug(`Fetching mod version '${version}' for '${modID}' from API: ${versionURL}`);
				versionRes = await fetch(versionURL);
			} catch (e) {
				return errorResponse(`Failed to fetch mod version '${version}' for '${modID}': ${e.stack}`, {
					performedActions: performedActions,
					errorModID: modID,
					errorReason: "version-fetch",
				});
			}

			// Check the content type is correct
			if (!versionRes.ok || !versionRes.headers.get("content-type")?.includes("application/zip")) {
				return errorResponse(`Invalid response for mod version '${version}' of '${modID}': ${versionRes.status} ${versionRes.statusText}`, {
					performedActions: performedActions,
					errorModID: modID,
					errorReason: "invalid-response",
				});
			}

			// Try to get the folder name from the Content-Disposition header
			let folderName = modID;
			const contentDisposition = versionRes.headers.get("content-disposition");
			if (contentDisposition) {
				const match = contentDisposition.match(/filename="?([^"]+)\.zip"?/i);
				if (match && match[1]) folderName = match[1];
			}

			// Check it doesn't exist
			const modExtractPath = path.join(this.baseModsPath, folderName);
			if (fs.existsSync(modExtractPath)) {
				return errorResponse(`Cannot install mod '${modID}' version '${version}' as the folder '${modExtractPath}' already exists`, {
					performedActions: performedActions,
					errorModID: modID,
					errorReason: "already-exists",
				});
			}

			// Extract the zip file to the mod path
			try {
				const buffer = Buffer.from(await versionRes.arrayBuffer(), "base64");
				const zip = new AdmZip(buffer);
				zip.extractAllTo(modExtractPath, false);
			} catch (e) {
				return errorResponse(`Failed to extract mod '${modID}' version '${version}': ${e.stack}`, {
					performedActions: performedActions,
					errorModID: modID,
					errorReason: "extraction-failed",
				});
			}

			logDebug(`Mod '${modID}' version '${version}' installed successfully`);
			return successResponse(`Mod '${modID}' version '${version}' installed successfully`);
		};

		const uninstall = async (modID) => {
			// If the mod is not installed, we can skip it
			if (!this.installedMods[modID]) {
				return errorResponse(`Cannot uninstall mod '${modID}' as it is not installed`, {
					performedActions: performedActions,
					errorModID: modID,
					errorReason: "not-installed",
				});
			}

			// Check the folder exists
			const modPath = this.installedMods[modID].path;
			if (!fs.existsSync(modPath)) {
				return errorResponse(`Cannot uninstall mod '${modID}' as its folder does not exist: ${modPath}`, {
					performedActions: performedActions,
					errorModID: modID,
					errorReason: "folder-not-found",
				});
			}

			// Remove the mod folder
			try {
				logDebug(`Uninstalling mod '${modID}' from path: ${modPath}`);
				fs.rmSync(modPath, { recursive: true, force: true });
			} catch (e) {
				return errorResponse(`Failed to uninstall mod '${modID}': ${e.stack}`, {
					performedActions: performedActions,
					errorModID: modID,
					errorReason: "uninstall-failed",
				});
			}

			// Remove it from the installed mods list
			delete this.installedMods[modID];

			logDebug(`Mod '${modID}' uninstalled successfully`);
			return successResponse(`Mod '${modID}' uninstalled successfully`);
		};

		this.isPerformingActions = true;
		const performedActions = [];
		try {
			// Go over each action in order and perform it
			for (const actionModID in allActions) {
				const action = allActions[actionModID];
				logDebug(`Performing action '${action.type}' for mod '${action.modID}' (version: '${action.version}')`);

				// Install the mod from the server
				if (action.type === "install") {
					const res = await install(action.modID, action.version);
					if (!res.success) {
						if (res.data && res.data.errorReason === "already-installed") {
							logWarn(`Pivoting to a 'change' action for mod '${action.modID}' as it is already installed with a different version`);

							const uninstallRes = await uninstall(action.modID);
							if (!uninstallRes.success) {
								this.isPerformingActions = false;
								return uninstallRes;
							}
							const installRes = await install(action.modID, action.version);
							if (!installRes.success) {
								this.isPerformingActions = false;
								return installRes;
							}
						} else {
							this.isPerformingActions = false;
							return res;
						}
					}
				}

				// Remove the mod from the local files
				else if (action.type === "uninstall") {
					const res = await uninstall(action.modID);
					this.isPerformingActions = false;
					if (!res.success) {
						this.isPerformingActions = false;
						return res;
					}
				}

				// Uninstall current version and install the new version
				else if (action.type === "change") {
					const uninstallRes = await uninstall(action.modID);
					if (!uninstallRes.success) {
						this.isPerformingActions = false;
						return uninstallRes;
					}
					const installRes = await install(action.modID, action.version);
					if (!installRes.success) {
						this.isPerformingActions = false;
						return installRes;
					}
				}
			}

			this.isPerformingActions = false;
			return successResponse("Mod actions performed successfully");
		} catch (e) {
			this.isPerformingActions = false;
			return errorResponse(`Error while performing mod actions: ${e.stack}`, {
				performedActions: performedActions,
				errorModID: null,
				errorReason: "unknown",
			});
		}
	}

	verifyDependencies() {
		const res = DependencyCalculator.verify(this.installedMods);

		if (!res.success) {
			for (const issue of res.issues) {
				if (issue.type === "missing") {
					logWarn(`Mod '${issue.modID}' is missing dependency: ${issue.dependencyModID} (${issue.dependency})`);
				} else if (issue.type === "disabled") {
					logWarn(`Mod '${issue.modID}' has dependency '${issue.dependencyModID}' which is disabled`);
				} else if (issue.type === "version") {
					logWarn(`Mod '${issue.modID}' has dependency '${issue.dependencyModID}' which does not satisfy version constraint '${issue.dependency}' (installed version: '${issue.dependencyVersion}')`);
				} else if (issue.type === "fluxloader-version") {
					logWarn(`Mod '${issue.modID}' has Fluxloader dependency which does not satisfy version constraint '${issue.dependency}' (installed version: '${issue.dependencyVersion}')`);
				}
			}

			const issueCount = res.issues.length;
			return errorResponse(`Found ${issueCount} mod dependency issue${issueCount === 1 ? "" : "s"}`, { errorReason: "mod-dependencies-invalid", issues: res.issues });
		}

		logDebug("All mod dependencies verified successfully");
		return successResponse("All mod dependencies are valid");
	}

	// ------------ INTERNAL ------------

	async _initializeMod(modPath) {
		// Load the modInfo schema on first call to this function
		if (!this.modInfoSchema) {
			try {
				const resolvedPath = resolvePathInsideFluxloader(modInfoSchemaPath);
				this.modInfoSchema = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
			} catch (e) {
				return errorResponse(`Failed to load modInfo schema: ${e.stack}`);
			}
		}

		// Try and read the modinfo.json
		let modInfo;
		const modInfoPath = path.join(modPath, "modinfo.json");
		logDebug(`Initializing mod: ${modInfoPath}`);
		if (!fs.existsSync(modInfoPath)) return errorResponse(`Mod does not have a modinfo.json file: ${modPath}`);
		try {
			modInfo = JSON.parse(fs.readFileSync(modInfoPath, "utf8"));
		} catch (e) {
			return errorResponse(`Failed to parse modinfo.json: ${modInfoPath} - ${e.stack}`);
		}

		// Validate it against the schema
		const res = SchemaValidation.validate({ target: modInfo, schema: this.modInfoSchema, config: { unknownKeyMethod: "ignore" } });
		if (!res.success) return errorResponse(`Mod info schema validation failed: (${res.source}) ${res.error.message}`);

		// Store the base schema
		try {
			modInfo.configSchemaBase = JSON.parse(JSON.stringify(modInfo.configSchema));
		} catch (e) {
			return errorResponse(`Failed to clone mod config schema: ${e.stack}`);
		}

		// Validate each entrypoint
		try {
			const validateEntrypoint = (type) => {
				const entrypointPath = modInfo[`${type}Entrypoint`];
				if (entrypointPath && !fs.existsSync(path.join(modPath, entrypointPath))) {
					throw new Error(`Mod '${modInfo.modID}' has an invalid ${type}Entrypoint: ${entrypointPath}`);
				}
			};
			validateEntrypoint("electron");
			validateEntrypoint("game");
			validateEntrypoint("worker");
		} catch (e) {
			return errorResponse(`Mod '${modInfo.modID}' has an invalid entrypoint: ${e.message}`);
		}

		// Load the mod scripts if they exist
		let scripts = null;
		if (modInfo.scriptPath) {
			try {
				const scriptPath = path.join(modPath, modInfo.scriptPath);
				logDebug(`Loading mod script: ${scriptPath}`);
				scripts = await import(`file://${scriptPath}`);
			} catch (e) {
				return errorResponse(`Failed to load mod script: ${modInfo.scriptPath} - ${e.stack}`);
			}
		}

		// Load README.md into description if it exists
		try {
			const readmePath = path.join(modPath, "README.md");
			if (fs.existsSync(readmePath)) {
				modInfo.description = fs.readFileSync(readmePath, "utf8");
			}
		} catch (e) {
			logWarn(`Failed to read README.md for mod ${modInfo.modID}: ${e.stack}`);
			modInfo.description = "";
		}

		// Ensure that the depencies are formatted correctly if they exist
		// https://github.com/npm/node-semver
		if (modInfo.dependencies) {
			for (const modID in modInfo.dependencies) {
				if (!FluxloaderSemver.isDependencyValid(modInfo.dependencies[modID])) {
					return errorResponse(`Mod '${modInfo.modID}' has an invalid dependency version for ${modID}: ${modInfo.dependencies[modID]}`);
				}
			}
		} else modInfo.dependencies = {};

		// Return scripts and mod data
		return successResponse(`Successfully initialized mod: ${modInfo.modID}`, {
			scripts: scripts,
			mod: {
				info: modInfo,
				path: modPath,
				isInstalled: true,
				isEnabled: true,
				isLoaded: false,
			},
		});
	}

	async _loadMod(mod) {
		if (mod.isLoaded) return errorResponse(`Mod already loaded: ${mod.info.modID}`);

		logDebug(`Loading mod: ${mod.info.modID}`);

		// if it defines a config schema then we need to validate it first
		if (mod.info.configSchema && Object.keys(mod.info.configSchema).length > 0) {
			logDebug(`Validating schema for mod: ${mod.info.modID}`);
			let modConfig = fluxloaderAPI.modConfig.get(mod.info.modID);
			let temp = this; // Not sure what reference to use here, but `this` in the callback will be the SchemaValidation itself
			const res = SchemaValidation.validate({
				target: modConfig,
				schema: mod.info.configSchema,
				validateCallback: function (data) {
					if (temp.modScriptsImport && temp.modScriptsImport[mod.info.modID] && temp.modScriptsImport[mod.info.modID].resolveInvalidSchemaValue) {
						return temp.modScriptsImport[mod.info.modID].resolveInvalidSchemaValue(data);
					}
					if (config.manager.defaultSchemaFallback) {
						return data.leaf.default;
					}
				},
			});
			if (!res.success) {
				return errorResponse(`Mod '${mod.info.modID}' config schema validation failed: (${res.source}) ${res.error.message}`);
			}
			fluxloaderAPI.modConfig.set(mod.info.modID, modConfig);
		}

		if (mod.info.electronEntrypoint) {
			try {
				const includeVMScript = (filePath) => {
					// Read the provided files content (relative to the mods folder)
					const absolutePath = path.join(mod.path, filePath);
					if (!fs.existsSync(absolutePath)) throw new Error(`File not found: ${absolutePath}`);
					const code = fs.readFileSync(absolutePath, "utf8");

					// Wrap the code in a top level async so it can be awaited
					const wrappedCode = `globalThis.toplevelAsyncWrapperExport = async () => {${code}\n}`;
					const identifier = url.pathToFileURL(absolutePath).href;
					const script = new vm.Script(wrappedCode, { filename: identifier });

					// Give it access to this includeVMScript
					const customRequire = Module.createRequire(absolutePath);
					this.modContext.require = customRequire;
					this.modContext.includeVMScript = includeVMScript;

					script.runInContext(this.modContext);
					return this.modContext.toplevelAsyncWrapperExport();
				};

				logDebug(`Loading electron entrypoint: ${mod.info.electronEntrypoint}`);

				try {
					await includeVMScript(mod.info.electronEntrypoint);
				} catch (e) {
					let out = `Error evaluating mod electron entrypoint (Mod ID: ${mod.info.modID})`;
					if (e && e.stack) out += `\n${e.stack}`;
					else if (e) out += `\n${e}`;
					logError(out);
				}
			} catch (e) {
				return errorResponse(`Error loading electron entrypoint for mod ${mod.info.modID}: ${e.stack}`);
			}
		}

		mod.isLoaded = true;
		this.loadedModCount++;
		fluxloaderAPI.events.trigger("fl:mod-loaded", mod);
		return successResponse(`Mod '${mod.info.modID}' loaded successfully`, mod);
	}

	async _unloadMod(mod) {
		if (!mod.isLoaded) logWarn(`Mod '${mod.info.modID}' is not loaded, cannot unload it`);
		logDebug(`Unloading mod: ${mod.info.modID}`);
		delete this.modScriptsImport[mod.info.modID];
		await fluxloaderAPI.events.trigger("fl:mod-unloaded", mod);
		mod.isLoaded = false;
		this.loadedModCount--;
	}

	_updateLoadOrder() {
		logDebug(`Updating load order...`);

		const res = this._calculateAutoLoadOrder();
		if (!res.success) return errorResponse(`Failed to calculate load order: ${res.message}`);

		if (!config.isLoadOrderManual || config.loadOrder.length == 0) {
			// If automatic just use the automatic load order
			this.loadOrder = res.data;
		} else {
			// Otherwise we want to as much as possible use the manual load order
			let finalLoadOrder = [];
			for (const modID of config.loadOrder) {
				if (this.installedMods[modID]) {
					finalLoadOrder.push(modID);
				} else {
					logWarn(`Mod '${modID}' in manual load order is not installed, skipping it`);
				}
			}

			logDebug(`Intermediate load order based on manual: [${finalLoadOrder.join(", ")}]`);

			// Add any mods that are not in the manual load order but are installed
			for (const modID in this.installedMods) {
				if (!finalLoadOrder.includes(modID)) {
					finalLoadOrder.push(modID);
				}
			}

			this.loadOrder = finalLoadOrder;
		}

		logDebug(`Final load order: [${this.loadOrder.join(", ")}]`);
		trySendManagerEvent("fl:load-order-updated", this.loadOrder);
	}

	_calculateAutoLoadOrder() {
		// Recalculate the load order based on the mod dependencies
		// Each mod needs to be before any mod that depends on it
		// This is a topological sort of the mod dependency graph using DFS
		let loadOrder = [];

		// Convert mod dependencies graph into a Map
		const modDependencies = new Map();
		for (const modID in this.installedMods) {
			modDependencies.set(modID, this.installedMods[modID].info.dependencies ? Object.keys(this.installedMods[modID].info.dependencies) : {});
		}

		// Track the nodes visited to avoid cycles and to avoid re-visiting nodes
		const totalVisited = new Set();
		const currentVisited = new Set();
		const visitModID = (modID) => {
			if (totalVisited.has(modID)) return;
			if (currentVisited.has(modID)) {
				logWarn(`Detected a cycle in mod dependencies for mod '${modID}'`);
				return;
			}
			currentVisited.add(modID);
			if (modDependencies.has(modID)) {
				for (const depModID of modDependencies.get(modID)) {
					if (modDependencies.has(depModID)) visitModID(depModID);
				}
			}
			currentVisited.delete(modID);
			totalVisited.add(modID);
			loadOrder.push(modID);
		};

		// Make sure every mod installed is visited and added to the load order
		for (const modID in this.installedMods) visitModID(modID);

		return successResponse(`Calculated load order for ${loadOrder.length} mod${loadOrder.length === 1 ? "" : "s"}`, loadOrder);
	}

	_applyModsScriptModifySchema() {
		// Modify each mods schema
		for (const modID in this.installedMods) {
			const mod = this.installedMods[modID];
			if (this.modScriptsImport[modID] && this.modScriptsImport[modID].modifySchema) {
				logDebug(`Modifying schema for mod: ${modID}`);
				mod.info.configSchema = JSON.parse(JSON.stringify(mod.info.configSchemaBase));
				this.modScriptsImport[modID].modifySchema(mod.info.configSchema);
				trySendManagerEvent("fl:mod-schema-updated", { modID, schema: mod.info.configSchema });
			}
		}
	}

	// ------------ GETTERS / SETTERS ------------

	getInstalledMods(config = {}) {
		const mods = this.loadOrder.map((modID) => this.installedMods[modID]);

		if (config.rendered) {
			const renderStart = Date.now();
			for (const mod of mods) {
				if (mod.info.description) {
					mod.renderedDescription = formatMarkdown(mod.info.description, mod.info.modID);
				} else {
					mod.renderedDescription = "";
				}
			}
			const renderEnd = Date.now();
			logDebug(`Rendered ${mods.length} descriptions for installed mods in ${renderEnd - renderStart}ms`);
		}

		return mods;
	}

	getLoadedMods() {
		return this.getInstalledMods().filter((mod) => mod.isLoaded);
	}

	getEnabledMods() {
		return this.getInstalledMods().filter((mod) => mod.isEnabled);
	}

	async getInstalledModsVersions() {
		let modVersions = {};

		if (this.loadOrder.length === 0) {
			logDebug("No mods installed, returning empty versions");
			return successResponse("No mods installed", modVersions);
		}

		try {
			const modIDs = this.loadOrder.join(",");
			const url = `https://fluxloader.app/api/mods?option=versions&modids=${modIDs}`;
			logDebug(`Fetching mod versions from API: ${url}`);
			const versionStart = Date.now();
			const response = await fetch(url);
			modVersions = await response.json();
			const versionEnd = Date.now();
			logDebug(`Fetched versions for ${this.loadOrder.length} installed mods in ${versionEnd - versionStart}ms`);
		} catch (e) {
			return errorResponse(`Failed to fetch mod versions from API: ${e.stack}`);
		}

		if (!modVersions || !Object.hasOwn(modVersions, "versions")) return errorResponse(`Invalid response from mod versions API: ${JSON.stringify(modVersions)}`);

		for (const modID in modVersions.versions) {
			const modVersionInfo = modVersions.versions[modID];
			if (this.isModInstalled(modID)) {
				this.installedMods[modID].versions = modVersionInfo;
				logDebug(`Updated mod '${modID}' version info with fetched data`);
			} else {
				logWarn(`Mod '${modID}' version info found but mod is not installed, skipping update`);
			}
		}

		return successResponse(`Fetched versions for ${this.loadOrder.length} installed mods`, modVersions.versions);
	}

	async getModVersion(args) {
		// If it is installed locally then we can just return the info
		if (this.isModInstalled(args.modID) && this.installedMods[args.modID].info.version === args.version) {
			logDebug(`Mod '${args.modID}' (v${args.version}) is installed locally, returning info`);
			return successResponse(`Mod '${args.modID}' (v${args.version}) is installed locally`, this.installedMods[args.modID]);
		}

		// Fetch the mod version info from the API
		let responseData = null;
		try {
			const url = `https://fluxloader.app/api/mods?option=info&modid=${encodeURIComponent(args.modID)}&version=${encodeURIComponent(args.version)}`;
			logDebug(`Fetching mod version info from API: ${url}`);
			const versionStart = Date.now();
			const response = await fetch(url);
			responseData = await response.json();
			const versionEnd = Date.now();
			logDebug(`Fetched version info for mod '${args.modID}' (v${args.version}) in ${versionEnd - versionStart}ms`);
		} catch (e) {
			return errorResponse(`Failed to fetch mod version info from API: ${e.stack}`);
		}

		// Check if the response is valid
		if (!responseData || !Object.hasOwn(responseData, "mod")) return errorResponse(`Invalid response from mod version API: ${JSON.stringify(responseData)}`);

		// Render the description if requested
		if (args.rendered && responseData.mod.modData.description) {
			const renderStart = Date.now();
			responseData.mod.renderedDescription = formatMarkdown(responseData.mod.modData.description, responseData.mod.modData.modID);
			const renderEnd = Date.now();
			logDebug(`Rendered description for mod '${args.modID}' (v${args.version}) in ${renderEnd - renderStart}ms`);
		}

		return successResponse(`Fetched version info for mod '${args.modID}' (v${args.version})`, responseData.mod);
	}

	isModInstalled(modID) {
		return Object.hasOwn(this.installedMods, modID);
	}

	setModEnabled(modID, enabled) {
		// Ensure mod exists and should be toggled
		if (!this.isModInstalled(modID)) return errorResponse(`Mod '${modID}' is not installed`);
		if (this.installedMods[modID].isEnabled === enabled) return successResponse(`Mod '${modID}' is already in the desired state: ${enabled}`);

		logDebug(`Setting mod '${modID}' enabled state to ${enabled}`);
		this.installedMods[modID].isEnabled = enabled;

		// Update mod schemas if needed
		this._applyModsScriptModifySchema();

		// Save this to the config file
		config.modsEnabled[modID] = enabled;
		const res = updateFluxloaderConfig();
		if (!res.success) return errorResponse(`Failed to update config after setting mod '${modID}' enabled state: ${res.message}`);

		return successResponse(`Mod '${modID}' enabled state set to ${enabled}`, this.installedMods[modID]);
	}
}

function loadFluxloaderConfig() {
	configSchema = {};
	logDebug(`Reading config from: ${configPath}`);

	// We must be able to read the config schema
	try {
		configSchemaPath = resolvePathInsideFluxloader(configSchemaPath);
		configSchema = JSON.parse(fs.readFileSync(configSchemaPath, "utf8"));
	} catch (e) {
		throw new Error(`Failed to read config schema: ${e.stack}`);
	}

	// If we fail to read config just use {}
	try {
		configPath = resolvePathRelativeToExecutable(configPath);
		config = JSON.parse(fs.readFileSync(configPath, "utf8"));
	} catch (e) {
		logDebug(`Failed to read config file: ${e.message}`);
		config = {};
	}

	// Validating against the schema will also set default values for any missing fields
	let res = SchemaValidation.validate({ target: config, schema: configSchema, config: { unknownKeyMethod: "delete" } });
	if (!res.success) {
		// Applying the schema to an empty {} will set the default values
		logDebug(`Config file ${configPath} is invalid: (${res.source}) ${res.error.message}`);
		config = {};
		res = SchemaValidation.validate({ target: config, schema: configSchema });
		if (!res.success) {
			throw new Error(`Failed to validate empty config file: (${res.source}) ${res.error.message}`);
		}
	}

	updateFluxloaderConfig();
	configLoaded = true;
	logDebug(`Config loaded successfully: ${configPath}`);
}

function updateFluxloaderConfig() {
	try {
		fs.writeFileSync(configPath, JSON.stringify(config, null, 4), "utf8");
	} catch (e) {
		return errorResponse(`Failed to write config file: ${configPath} - ${e.stack}`);
	}
	logDebug(`Fluxloader config updated successfully: ${configPath}`);
	if (fluxloaderAPI) {
		fluxloaderAPI.events.tryTrigger("fl:fluxloader-config-updated", config);
		trySendManagerEvent("fl:fluxloader-config-updated", config);
	}
	return successResponse(`Fluxloader config updated successfully: ${configPath}`);
}

function findValidGamePath() {
	// First cleanup any old temp directories
	const res = GameFilesManager.deleteOldTempDirectories();
	if (!res.success) return errorResponse(`Failed to delete old temp directories: ${res.message}`);

	function findGameAsarInDirectory(dir) {
		if (!fs.existsSync(dir)) return null;

		let foundAny = false;
		for (let name of ["sandustrydemo", "sandustrydemo.exe"]) {
			try {
				const gamePath = path.join(dir, name);
				if (fs.existsSync(gamePath)) {
					foundAny = true;
					break;
				}
			} catch (e) {}
		}
		if (!foundAny) return null;

		const asarPath = path.join(dir, "resources", "app.asar");
		if (!fs.existsSync(asarPath)) return null;

		return asarPath;
	}

	// Look in the configured directory for the games app.asar
	let fullGamePath = null;
	let asarPath = null;
	try {
		fullGamePath = resolvePathRelativeToExecutable(config.gamePath);
		asarPath = findGameAsarInDirectory(fullGamePath);

		if (!asarPath) {
			logDebug(`Cannot find games app.asar in configured directory: ${fullGamePath}`);
			logDebug("Checking default steam directories...");

			const checkPaths = {
				windows: [process.env["ProgramFiles(x86)"], "Steam", "steamapps", "common", "Sandustry Demo"],
				linux: [process.env.HOME, ".local", "share", "Steam", "steamapps", "common", "Sandustry Demo"],
				mac: [process.env.HOME, "Library", "Application Support", "Steam", "steamapps", "common", "Sandustry Demo"],
			};

			// Look in the default steam directory for the games app.asar
			let steamGamePath;
			for (const [OS, gamePath] of Object.entries(checkPaths)) {
				try {
					steamGamePath = path.join(...gamePath);
				} catch {
					logDebug(`Default steam path for ${OS} is invalid..`);
					continue;
				}
				asarPath = findGameAsarInDirectory(steamGamePath);
				if (asarPath) {
					logDebug(`Found app.asar in default steam directory for ${OS}: ${steamGamePath}`);
					break;
				}
				logDebug(`app.asar not found in ${OS} steam path: ${steamGamePath}..`);
			}

			if (!asarPath) {
				return errorResponse(`Failed to find game app.asar in configured path: ${fullGamePath} or default steam directories.`);
			}

			// Update the config if we found the game in the default steam directory
			fullGamePath = steamGamePath;
			config.gamePath = steamGamePath;

			const res = updateFluxloaderConfig();
			if (!res.success) return errorResponse(`Failed to update config with new game path: ${steamGamePath} - ${res.message}`);
		}
	} catch (e) {
		return errorResponse(`Failed to find game app.asar in configured path: ${config.gamePath} - ${e.stack}`);
	}

	logDebug(`Found game app.asar: ${asarPath}`);
	return successResponse(`Found game app.asar: ${asarPath}`, { fullGamePath, asarPath });
}

function addFluxloaderPatches() {
	logInfo("Adding fluxloader patches to game files...");

	// All of these set patches are turned into errors so we can deal with them all in 1 go in the catch block
	// All of these need to be applied successfully for the game to run properly
	try {
		// Enable the debug flag
		responseAsError(
			gameFilesManager.setPatch("js/bundle.js", "fluxloader:debugFlag", {
				type: "replace",
				from: "debug:{active:!1",
				to: "debug:{active:1",
			}),
		);

		// Puts __debug into fluxloaderAPI.gameInstance
		responseAsError(
			gameFilesManager.setPatch("js/bundle.js", "fluxloader:loadGameInstance", {
				type: "replace",
				from: "}};var r={};",
				to: "}};fluxloaderOnGameInstanceCreated(__debug);var r={};",
			}),
		);

		// Add game.js to bundle.js, and dont start game until it is ready
		const gameScriptPath = resolvePathInsideFluxloader("game.js").replaceAll("\\", "/");
		responseAsError(
			gameFilesManager.setPatch("js/bundle.js", "fluxloader:preloadBundle", {
				type: "replace",
				from: `(()=>{var e,t,n={8916`,
				to: `import "${gameScriptPath}";fluxloaderPreloadBundle().then$$`,
				token: "$$",
			}),
		);
		responseAsError(
			gameFilesManager.setPatch("js/bundle.js", "fluxloader:preloadBundleFinalize", {
				type: "replace",
				from: `)()})();`,
				to: `)()});`,
			}),
		);

		// Expose the games world to bundle.js
		// This is awkward, as the array [4,init] is the return statement in a switch
		responseAsError(
			gameFilesManager.setPatch("js/bundle.js", "fluxloader:gameWorldInitialized", {
				type: "replace",
				from: `[4,s.environment.multithreading.simulation.init(s)]`,
				to: `[4,s.environment.multithreading.simulation.init(s),fluxloaderOnGameInitialized()]`,
			}),
		);

		// Listen for fluxloader worker messages in bundle.js
		responseAsError(
			gameFilesManager.setPatch("js/bundle.js", "fluxloader:onWorkerMessage", {
				type: "replace",
				from: "case f.InitFinished:",
				to: "case 'fluxloaderMessage':fluxloaderOnWorkerMessage(r);break;$$",
				token: "$$",
			}),
		);

		const workers = ["546", "336"];
		for (const worker of workers) {
			// Listen for fluxloader worker messages in each worker
			responseAsError(
				gameFilesManager.setPatch(`js/${worker}.bundle.js`, "fluxloader:onWorkerMessage", {
					type: "replace",
					from: `case i.dD.Init:`,
					to: `case 'fluxloaderMessage':fluxloaderOnWorkerMessage(e);break;$$`,
					token: "$$",
				}),
			);

			// Add worker.js to each worker, and dont start until it is ready
			// Also make a global list of worker entrypoints to use
			// Also queue up any messages received before setup
			const workerEntrypoints = modsManager
				.getLoadedMods()
				.filter((mod) => mod.info.workerEntrypoint)
				.map((mod) => path.join(mod.path, mod.info.workerEntrypoint));
			const workerScriptPath = resolvePathInsideFluxloader(`worker.js`).replaceAll(/\\/g, "/");
			responseAsError(
				gameFilesManager.setPatch(`js/${worker}.bundle.js`, "fluxloader:preloadBundle", {
					type: "replace",
					from: `(()=>{"use strict"`,
					to: `
						globalThis.fluxloaderBasePath="${resolvePathInsideFluxloader(".").replace(/\\/g, "/")}";
						globalThis.fluxloaderWorkerEntrypoints=${JSON.stringify(workerEntrypoints)};
						let preloadMessageQueue = [];
						self.onmessage = (e) => preloadMessageQueue.push(e);
						importScripts("${workerScriptPath}");
						fluxloaderPreloadBundle().then$$`,
					token: "$$",
				}),
			);
			responseAsError(
				gameFilesManager.setPatch(`js/${worker}.bundle.js`, "fluxloader:preloadBundleFinalize", {
					type: "replace",
					from: `()})();`,
					to: `()});`,
				}),
			);
		}

		// Process the queue messages
		responseAsError(
			gameFilesManager.setPatch(`js/336.bundle.js`, "fluxloader:processQueuedMessages", {
				type: "replace",
				from: `W.store.upgrades[ee][te].level=re}}`,
				to: `$$;if (preloadMessageQueue){for (const msg of preloadMessageQueue) self.onmessage(msg);}preloadMessageQueue=undefined;`,
				token: "$$",
			}),
		);
		responseAsError(
			gameFilesManager.setPatch(`js/546.bundle.js`, "fluxloader:processQueuedMessages", {
				type: "replace",
				from: `a.session.paused=e.data[1]}};`,
				to: `$$if (preloadMessageQueue){for (const msg of preloadMessageQueue) {self.onmessage(msg);}}preloadMessageQueue=undefined;`,
				token: "$$",
			}),
		);

		// Notify worker.js when the workers are ready
		// These are different for each worker
		responseAsError(
			gameFilesManager.setPatch(`js/336.bundle.js`, "fluxloader:workerInitialized", {
				type: "replace",
				from: `W.environment.postMessage([i.dD.InitFinished]);`,
				to: `fluxloaderOnWorkerInitialized(W);$$`,
				token: "$$",
			}),
		);
		responseAsError(
			gameFilesManager.setPatch(`js/546.bundle.js`, "fluxloader:workerInitialized2", {
				type: "replace",
				from: `t(performance.now());break;`,
				to: `t(performance.now());fluxloaderOnWorkerInitialized(a);break;`,
			}),
		);

		// Add React to globalThis
		responseAsError(
			gameFilesManager.setPatch("js/bundle.js", "fluxloader:exposeReact", {
				type: "replace",
				from: `var Cl,kl=i(6540)`,
				to: `globalThis.React=i(6540);var Cl,kl=React`,
			}),
		);

		if (config.game.enableDebugMenu) {
			// Adds configrable zoom
			responseAsError(
				gameFilesManager.setPatch("js/bundle.js", "fluxloader:debugMenuZoom", {
					type: "replace",
					from: 'className:"fixed bottom-2 right-2 w-96 pt-12 text-white"',
					to: `$$,style:{zoom:"${config.game.debugMenuZoom * 100}%"}`,
					token: "$$",
				}),
			);
		} else {
			// Disables the debug menu
			responseAsError(
				gameFilesManager.setPatch("js/bundle.js", "fluxloader:disableDebugMenu", {
					type: "replace",
					from: "function _m(t){",
					to: "$$return;",
					token: "$$",
				}),
			);

			// Disables the debug keybinds
			responseAsError(
				gameFilesManager.setPatch("js/bundle.js", "fluxloader:disableDebugKeybinds", {
					type: "replace",
					from: "spawnElements:function(n,r){",
					to: "$$return false;",
					token: "$$",
				}),
			);

			// Disables the pause camera keybind
			responseAsError(
				gameFilesManager.setPatch("js/bundle.js", "fluxloader:disablePauseCamera", {
					type: "replace",
					from: "e.debug.active&&(t.session.overrideCamera",
					to: "return;$$",
					token: "$$",
				}),
			);

			// Disables the pause keybind
			responseAsError(
				gameFilesManager.setPatch("js/bundle.js", "fluxloader:disablePause", {
					type: "replace",
					from: "e.debug.active&&(t.session.paused",
					to: "return;$$",
					token: "$$",
				}),
			);
		}

		responseAsError(
			gameFilesManager.setPatch("js/bundle.js", "fluxloader:electron-remove-error-require", {
				type: "replace",
				from: `try{(Hg=require("@emotion/is-prop-valid").default)&&(Vg=e=>e.startsWith("on")?!Gg(e):Hg(e))}catch(Cl){}`,
				to: "",
			}),
		);

		if (!config.game.disableMenuSubtitle) {
			// Pass in subtitle image path to game
			let image = resolvePathInsideFluxloader("images/subtitle.png");
			image = image.replaceAll("\\", "/");
			responseAsError(
				gameFilesManager.setPatch("js/bundle.js", "fluxloader:menuSubtitle", {
					type: "regex",
					pattern: "if\\(t\\.store\\.scene\\.active===x\\.MainMenu\\)(.+?)else",
					// this relies on minified name "Od" which places blocks
					// If this breaks search the code for "e" for placing blocks in debug
					replace: `if(t.store.scene.active===x.MainMenu){globalThis.setupModdedSubtitle(Od,"${image}");$1}else`,
				}),
			);
		}
	} catch (e) {
		return errorResponse(`Failed to apply fluxloader patches: ${e.stack}`);
	}

	logDebug("Fluxloader patches applied successfully");
	return successResponse("Fluxloader patches applied successfully");
}

function trySendManagerEvent(eventName, args) {
	if (!managerWindow || managerWindow.isDestroyed()) return;
	try {
		if (eventName !== "fl:forward-log") logDebug(`Sending event '${eventName}' to manager`);
		managerWindow.webContents.send(eventName, args);
	} catch (e) {
		logError(`Failed to send event ${eventName} to manager window: ${e.stack}`);
	}
}

// =================== ELECTRON  ===================

globalThis.attachDebuggerToGameWindow = function (window) {
	// Attach the debugger so we can intercept requests
	window.webContents.debugger.attach("1.3");

	window.webContents.debugger.sendCommand("Fetch.enable", {
		patterns: [{ urlPattern: "*", requestStage: "Request" }],
	});

	window.webContents.debugger.on("message", async (event, method, params) => {
		if (method === "Fetch.requestPaused") {
			const { requestId, request } = params;

			// We only care about files inside the gameFilesManager.tempExtractedPath
			if (request.url.startsWith("file://")) {
				const filePath = url.fileURLToPath(request.url).replaceAll("\\", "/");
				const tempExtractedPath = gameFilesManager.tempExtractedPath.replaceAll("\\", "/");
				await fluxloaderAPI.events.trigger("fl:file-requested", filePath, false);
				if (filePath.startsWith(tempExtractedPath)) {
					const relativePath = filePath.replace(tempExtractedPath + "/", "");
					if (relativePath === "index.html") {
						let queryParams = request.url.split("?");
						// Make sure query params do exist
						if (queryParams.length > 1) {
							queryParams = queryParams[1];
							if (queryParams.includes("new_game")) {
								await fluxloaderAPI.events.trigger("fl:pre-scene-loaded", "intro");
							} else if (queryParams.includes("db_load")) {
								await fluxloaderAPI.events.trigger("fl:pre-scene-loaded", "game");
							} else {
								await fluxloaderAPI.events.trigger("fl:pre-scene-loaded", "mainmenu");
							}
						} else {
							// Loading menu if no query parameters are present
							await fluxloaderAPI.events.trigger("fl:pre-scene-loaded", "mainmenu");
						}
					}
					gameFilesManager.ensureFilePatchesUpToDate(relativePath);
					if (relativePath === "js/bundle.js") {
						gameFilesManager.ensureFilePatchesUpToDate("js/153.bundle.js");
						gameFilesManager.ensureFilePatchesUpToDate("js/336.bundle.js");
						gameFilesManager.ensureFilePatchesUpToDate("js/515.bundle.js");
						gameFilesManager.ensureFilePatchesUpToDate("js/546.bundle.js");
					}
				}
			}

			// Allow non-file requests to continue
			window.webContents.debugger.sendCommand("Fetch.continueRequest", { requestId });
		}
	});
};

function handleUncaughtErrors() {
	process.on("uncaughtException", (err) => {
		logError(`Uncaught exception: ${err.stack}`);
		if (!config.ignoreUnhandledExceptions) {
			cleanupApp();
			process.exit(1);
		}
	});
	process.on("unhandledRejection", (err) => {
		logError(`Unhandled rejection: ${err.stack}`);
		if (!config.ignoreUnhandledExceptions) {
			cleanupApp();
			process.exit(1);
		}
	});
	process.on("SIGINT", () => {
		logInfo("SIGINT received, exiting...");
		cleanupApp();
		process.exit(0);
	});
	process.on("SIGTERM", () => {
		logInfo("SIGTERM received, exiting...");
		cleanupApp();
		process.exit(0);
	});
}

function openModFolderNative(modID) {
	if (!modsManager.isModInstalled(modID)) {
		return errorResponse(`Mod '${modID}' is not installed, cannot open folder`);
	}
	const mod = modsManager.installedMods[modID];
	if (!fs.existsSync(mod.path)) {
		return errorResponse(`Mod folder does not exist: ${modFolderPath}`);
	}

	logDebug(`Opening mod folder for '${modID}': ${mod.path}`);
	try {
		shell.openPath(mod.path);
	} catch (e) {
		return errorResponse(`Failed to open mod folder for '${modID}': ${e.message}`, null, false);
	}
	return successResponse(`Opened mod folder for '${modID}'`);
}

function openModsFolderNative() {
	logDebug(`Opening mods folder: ${modsManager.baseModsPath}`);
	try {
		shell.openPath(modsManager.baseModsPath);
	} catch (e) {
		return errorResponse(`Failed to open mods folder: ${e.message}`, null, false);
	}
	return successResponse(`Opened mods folder`);
}

function openExtractedFolderNative() {
	logDebug(`Opening extracted folder: ${gameFilesManager.tempExtractedPath}`);
	try {
		shell.openPath(gameFilesManager.tempExtractedPath);
	} catch (e) {
		return errorResponse(`Failed to extracted folder: ${e.message}`, null, false);
	}
	return successResponse(`Opened game folder`);
}

async function pickFolderNative(args) {
	let defaultPath = resolvePathRelativeToExecutable(".");
	if (args.initialPath) defaultPath = path.resolve(defaultPath, args.initialPath);

	const result = await dialog.showOpenDialog({
		title: "Select a folder",
		defaultPath,
		properties: ["openDirectory", "createDirectory"],
	});

	if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
		return errorResponse("No folder selected", null, false);
	}

	const selectedPath = result.filePaths[0];
	logDebug(`Selected folder: ${selectedPath}`);
	return successResponse("Folder selected successfully", selectedPath);
}

async function pickFileNative(args) {
	let defaultPath = resolvePathRelativeToExecutable(".");
	if (args.initialPath) defaultPath = path.resolve(defaultPath, args.initialPath);
	const result = await dialog.showOpenDialog({
		title: "Select a file",
		defaultPath,
		properties: ["openFile"],
	});

	if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
		return errorResponse("No file selected", null, false);
	}

	const selectedPath = result.filePaths[0];
	logDebug(`Selected file: ${selectedPath}`);
	return successResponse("File selected successfully", selectedPath);
}

async function downloadUpdate(release) {
	try {
		if (config.manager.updateOS === "None") {
			if (!process.env.BUILDNAME) throw new Error("No updateOS configured, and could not find BUILDNAME env var");
			config.manager.updateOS = process.env.BUILDNAME;
			updateFluxloaderConfig();
		}

		// Map from readable OS string to filename pattern
		const assetNameMap = {
			"Windows x64 Portable": `fluxloader-win-x64.exe`,
			"Windows legacy Portable": `fluxloader-win-x64-legacy.exe`,
			"Windows arm64 Portable": `fluxloader-win-arm64.exe`,
			"macOS x64 Zip": `fluxloader-mac-x64.zip`,
			"macOS arm64 Zip": `fluxloader-mac-arm64.zip`,
			"Linux x86_64 AppImage": `fluxloader-linux-x86_64.AppImage`,
			"Linux arm64 AppImage": `fluxloader-linux-arm64.AppImage`,
			"Linux arm64 deb": `fluxloader-linux-arm64.deb`,
			None: null,
		};

		// Lookup the filename from config.manager.updateOS
		const filename = assetNameMap[config.manager.updateOS];
		if (!filename) {
			throw new Error(`No asset mapping for ${config.manager.updateOS}`);
		}

		// Find the asset by its uploaded name
		const targetAsset = release.assets.find((r) => r.name === filename);
		if (!targetAsset) {
			throw new Error(`Could not find asset for ${config.manager.updateOS} (expected filename: ${filename})`);
		}

		let isUnix = ["linux", "darwin"].includes(process.platform);
		let resources = app.isPackaged ? process.resourcesPath : process.cwd();
		const downloadUrl = targetAsset.browser_download_url;
		let installPath = resolvePathRelativeToExecutable(".");
		logDebug(`Starting update helper with parameters: [${installPath}, ${process.pid}, ${downloadUrl}]`);

		if (isUnix) {
			spawn(path.join(resources, "./updater.sh"), [process.pid, downloadUrl], {
				cwd: installPath,
				detached: true,
				stdio: "ignore",
				shell: true,
			}).unref();
		} else {
			fs.copyFileSync(path.join(resources, "updater.bat"), path.join(installPath, "updater.bat"));
			spawn("cmd.exe", ["/c", "start", '"Fluxloader Updater"', '"' + path.join(installPath, "updater.bat") + '"', process.pid, downloadUrl], {
				cwd: installPath,
				detached: true,
				stdio: "ignore",
				shell: true,
			}).unref();
		}
		return true;
	} catch (error) {
		logError(`Error downloading update: ${error.message}`);
		return false;
	}
}

function setupElectronIPC() {
	logDebug("Setting up electron IPC handlers");

	ipcMain.removeAllListeners();

	const simpleEndpoints = {
		"fl:get-loaded-mods": (_) => modsManager.getLoadedMods(),
		"fl:get-installed-mods": (args) => modsManager.getInstalledMods(args),
		"fl:get-installed-mods-versions": (args) => modsManager.getInstalledModsVersions(args),
		"fl:fetch-remote-mods": async (args) => await modsManager.fetchRemoteMods(args),
		"fl:fetch-remote-mod": async (args) => await modsManager.fetchRemoteMod(args),
		"fl:calculate-mod-actions": async (args) => await modsManager.calculateModActions(args),
		"fl:perform-mod-actions": async (args) => await modsManager.performModActions(args),
		"fl:get-mod-version": async (args) => await modsManager.getModVersion(args),
		"fl:reload-installed-mods": async (_) => await modsManager.reloadInstalledMods(),
		"fl:set-mod-enabled": async (args) => modsManager.setModEnabled(args.modID, args.enabled),
		"fl:set-is-load-order-manual": async (args) => modsManager.setIsLoadOrderManual(args),
		"fl:get-is-load-order-manual": (_) => config.isLoadOrderManual,
		"fl:get-load-order": (_) => modsManager.loadOrder,
		"fl:set-manual-load-order": (args) => modsManager.setManualLoadOrder(args),
		"fl:create-new-mod": (args) => modsManager.createNewMod(args),
		"fl:start-game": (_) => startGame(),
		"fl:start-unmodded-game": (_) => startUnmoddedGame(),
		"fl:close-game": (_) => closeGame(),
		"fl:get-fluxloader-config": (_) => config,
		"fl:get-mod-info-schema": (_) => modsManager.modInfoSchema,
		"fl:get-fluxloader-config-schema": (_) => configSchema,
		"fl:get-fluxloader-version": (_) => fluxloaderVersion,
		"fl:download-update": async (args) => await downloadUpdate(args),
		"fl:forward-log-to-manager": (args) => forwardLogToManager(args),
		"fl:request-manager-logs": (_) => logsForManager,
		"fl:open-mod-folder": (args) => openModFolderNative(args),
		"fl:open-mods-folder": (_) => openModsFolderNative(),
		"fl:open-extracted-folder": (_) => openExtractedFolderNative(),
		"fl:pick-folder": async (args) => await pickFolderNative(args),
		"fl:pick-file": async (args) => await pickFileNative(args),
	};

	for (const [endpoint, handler] of Object.entries(simpleEndpoints)) {
		ipcMain.handle(endpoint, (_, args) => {
			if (!["fl:forward-log-to-manager"].includes(endpoint)) {
				logDebug(`Received '${endpoint}'`);
			}
			try {
				return handler(args);
			} catch (e) {
				logError(`Error in IPC handler for ${endpoint}: ${e.stack}, this shouldn't happen and will be ignored`);
				return null;
			}
		});
	}

	ipcMain.handle("fl:set-fluxloader-config", async (event, args) => {
		logDebug(`Received 'fl:set-fluxloader-config' with args: ${JSON.stringify(args)}`);
		if (!configLoaded) {
			return errorResponse("Config not loaded yet");
		}
		const res = SchemaValidation.validate({ target: args, schema: configSchema });
		if (!res.success) return errorResponse(`Invalid config data provided: (${res.source}) ${res.error.message}`);
		config = args;
		return updateFluxloaderConfig();
	});

	ipcMain.handle("fl:ping-server", async (event, args) => {
		logDebug(`Received 'fl:ping-server' with args: ${JSON.stringify(args)}`);
		try {
			const url = `https://fluxloader.app/api`;
			logDebug(`Pinging server at ${url}`);
			const pingStart = Date.now();
			const response = await fetch(url);
			const data = await response.json();
			const pingEnd = Date.now();
			logDebug(`Pinged server in ${pingEnd - pingStart}ms`);
			return successResponse("Server pinged successfully", { data, ping: pingEnd - pingStart });
		} catch (e) {
			return errorResponse(`Failed to ping server: ${e.message}`);
		}
	});
}

async function startManager() {
	if (isManagerStarted) return errorResponse("Cannot start manager, already running");
	logDebug("Starting manager");
	isManagerStarted = true;

	// Create the manager window
	try {
		const primaryDisplay = screen.getPrimaryDisplay();
		const { width, height } = primaryDisplay.workAreaSize;
		let managerWindowWidth = 1200;
		managerWindowWidth = Math.floor(width * 0.8);
		let managerWindowHeight = managerWindowWidth * (height / width);

		managerWindow = new BrowserWindow({
			width: managerWindowWidth,
			height: managerWindowHeight,
			autoHideMenuBar: true,
			webPreferences: {
				nodeIntegration: true,
				preload: resolvePathInsideFluxloader("manager/manager-preload.js"),
			},
		});

		// Redirect requests to the browser instead of internal electron
		managerWindow.webContents.setWindowOpenHandler(({ url }) => {
			shell.openExternal(url);
			return { action: "deny" };
		});

		// Startup the manager window into manager.html
		const managerPath = resolvePathInsideFluxloader("manager/manager.html");
		managerWindow.on("closed", closeManager);
		managerWindow.loadFile(managerPath);
		managerWindow.once("ready-to-show", () => {
			if (config.manager.openDevTools) managerWindow.openDevTools();
		});
	} catch (e) {
		await closeManager();
		return errorResponse(`Error starting manager window: ${e.stack}`);
	}

	logInfo(`Manager window opened successfully`);
	return successResponse("Manager window opened successfully");
}

async function closeManager() {
	if (!isManagerStarted) throw new Error("Cannot close manager, it is not started");
	logDebug("Cleaning up manager window");
	if (managerWindow && !managerWindow.isDestroyed()) {
		managerWindow.off("closed", closeManager);
		managerWindow.close();
	}
	managerWindow = null;
	if (config.closeGameWithManager && gameWindow) {
		logDebug("Closing game window with fluxloader window");
		await closeGame();
	}
	isManagerStarted = false;
}

function setupFirstStart() {
	if (gameFilesManager) return true; // Already setup
	let res = findValidGamePath();
	if (!res.success) {
		isGameStarted = false;
		return false;
	}
	const { fullGamePath, asarPath } = res.data;

	gameFilesManager = new GameFilesManager(fullGamePath, asarPath);
	return true;
}

async function startUnmoddedGame() {
	if (isGameStarted) return errorResponse("Cannot start game, already running");

	logInfo("Starting unmodded sandustry");
	isGameStarted = true;

	// Startup the events, files, and mods
	try {
		if (!setupFirstStart()) return errorResponse("Error starting game window: Cannot setup game files manager. Ensure gamePath is configured correctly.", null, false);

		fluxloaderAPI._initializeEvents();
		responseAsError(gameFilesManager.resetToBaseFiles());
		responseAsError(await gameFilesManager.patchAndRunGameElectron());

		gameElectronFuncs.createWindow();
		gameWindow.on("closed", closeGame);
		gameWindow.once("ready-to-show", () => {
			if (config.game.openDevTools) gameWindow.openDevTools();
		});
	} catch (e) {
		logError(`Error starting unmodded game window: ${e.stack}`);
		await closeGame();
		return errorResponse(`Error starting unmodded game window`, null, false);
	}

	fluxloaderAPI.events.trigger("fl:game-started");
	logInfo(`Unmodded game window started successfully`);
	return successResponse("Unmodded game started successfully");
}

async function startGame() {
	if (isGameStarted) return errorResponse("Cannot start game, already running");

	logInfo("Starting sandustry");
	isGameStarted = true;

	// Startup the events, files, and mods
	try {
		// Before all else verify dependencies
		const res = modsManager.verifyDependencies();
		if (!res.success) {
			logError(`Cannot start game, mod dependency error: ${res.message}`);
			isGameStarted = false;
			return res;
		}

		if (!setupFirstStart()) return errorResponse("Error starting game window: Cannot setup game files manager. Ensure gamePath is configured correctly.", null, false);
		fluxloaderAPI._initializeEvents();
		responseAsError(gameFilesManager.resetToBaseFiles());
		responseAsError(await gameFilesManager.patchAndRunGameElectron());
		responseAsError(await modsManager.loadAllMods());
		responseAsError(addFluxloaderPatches()); // We need loaded mods for the patches
		responseAsError(gameFilesManager.repatchAllFiles());

		gameElectronFuncs.createWindow();
		gameWindow.on("closed", closeGame);
		gameWindow.once("ready-to-show", () => {
			if (config.game.openDevTools) gameWindow.openDevTools();
		});

		fluxloaderAPI.events.trigger("fl:game-started");
		logInfo(`Game window started successfully`);
		return successResponse("Game window started successfully");
	} catch (e) {
		logError(`Error starting game window: ${e.stack}`);
		await closeGame();
		return errorResponse(`Error starting game window`, null, false);
	}
}

async function closeGame() {
	if (!isGameStarted) return errorResponse("Cannot close game, it is not started");
	logDebug("Closing game window");
	if (gameWindow && !gameWindow.isDestroyed()) {
		gameWindow.off("closed", closeGame);
		gameWindow.close();
	}
	gameWindow = null;
	fluxloaderAPI.events.trigger("fl:game-closed");
	await modsManager.unloadAllMods();
	fluxloaderAPI.events.clear();
	trySendManagerEvent("fl:game-closed");
	isGameStarted = false;
}

async function closeApp() {
	await cleanupApp();
	app.quit();
}

async function cleanupApp() {
	try {
		if (managerWindow) await closeManager();
		if (gameWindow) await closeGame();
		if (gameFilesManager) gameFilesManager.deleteFiles();
	} catch (e) {
		logError(`Error during cleanup: ${e.stack}`);
	}
	logDebug("Cleanup complete");
}

async function startApp() {
	logInfo(`Starting Electron Sandustry Fluxloader ${fluxloaderVersion}`);

	// These are enabled for running the game
	process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
	app.commandLine.appendSwitch("enable-features", "SharedArrayBuffer");
	app.commandLine.appendSwitch("force_high_performance_gpu");
	app.commandLine.appendSwitch("js-flags", "--experimental-vm-modules");

	// Wait for electron to be ready to go
	await app.whenReady();

	// The electron app as a whole closed when all windows are closed
	app.on("window-all-closed", async () => {
		logInfo("All windows closed, exiting...");
		if (process.platform !== "darwin") {
			await closeApp();
		}
	});

	// One-time fluxloader setup
	handleUncaughtErrors();
	loadFluxloaderConfig();

	fluxloaderAPI = new ElectronFluxloaderAPI();

	modsManager = new ModsManager();

	logInfo(`Successfully initialized fluxloader`);

	responseAsError(await modsManager.reloadInstalledMods());
	setupElectronIPC();

	// Start manager or game window based on config
	if (config.loadIntoManager) {
		responseAsError(await startManager());
	} else {
		responseAsError(await startGame());
	}
}

// =================== MAIN ===================

dotenv.config({
	path: app.isPackaged ? path.join(process.resourcesPath, ".env") : path.resolve(process.cwd(), ".env"),
});

(async () => {
	await startApp();
})();
