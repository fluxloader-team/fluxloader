import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
import path from "path";
import fs from "fs";
import process from "process";
import os from "os";
import asar from "asar";
import url from "url";
import vm from "vm";
import { randomUUID } from "crypto";
import { marked } from "marked";
import { EventBus, SchemaValidation, Logging } from "./common.js";
import semver from "semver";

// ---- General architecture ----
//
// Top level functions of classes / the fluxloader should not throw errors in cases where it is not catastrophic
// Instead use successResponse() or errorResponse() to return a response object
//
// - Low level file operations (like reading a file) can throw errors, but they should be caught and handled
// - Similarly, internal functions can throw errors as long as the interface functions catch and handle them
//
// Uncaught errors are caught and windows closed and cleaned up
// Its important to note more errors can occur afterwards so be wary with the cleanup code

// =================== VARIABLES ===================

globalThis.fluxloaderVersion = "2.0.0";
globalThis.fluxloaderAPI = undefined;
globalThis.gameElectronFuncs = undefined;
globalThis.gameWindow = undefined;

let logLevels = ["debug", "info", "warn", "error"];
let preConfigLogLevel = "debug";
let configPath = "fluxloader-config.json";
let configSchemaPath = "schema.fluxloader-config.json";
let modInfoSchemaPath = "schema.mod-info.json";
let logFilePath = undefined;
let config = undefined;
let configSchema = undefined;
let configLoaded = false;
let modsManager = undefined;
let gameFilesManager = undefined;
let managerWindow = undefined;
let fluxloaderEvents = undefined;
let logsForManager = [];
let isGameStarted = false;
let isManagerStarted = false;

// =================== LOGGING ===================

function setupLogFile() {
	if (!configLoaded) return;
	if (logFilePath) return;
	logFilePath = resolvePathRelativeToFluxloader(config.logging.logFilePath);
	try {
		fs.appendFileSync(logFilePath, new Date().toISOString() + "\n");
	} catch (e) {
		throw new Error(`Error writing to log file: ${e.stack}`); // Config loading error is catastrophic for now
	}
	const stat = fs.statSync(logFilePath);
	const fileSize = stat.size / 1024 / 1024;
	if (fileSize > 2) {
		logWarn(`Log file is over 2MB: ${logFilePath} (${fileSize.toFixed(2)}MB)`);
	}
	logDebug(`Fluxloader log path: ${logFilePath}`);
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
			if (!logFilePath) setupLogFile();
			fs.appendFileSync(logFilePath, `${header} ${message}\n`);
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

function errorResponse(message, data = null, log = true) {
	if (log) logError(message);
	return { success: false, message, data };
}

function successResponse(message, data = null) {
	return { success: true, message, data };
}

function responseAsError(response) {
	if (!response) throw new Error("Response is undefined");
	if (!response.success) throw new Error(response.message);
	return response;
}

function resolvePathRelativeToFluxloader(name) {
	// If absolute then return the path as is
	if (path.isAbsolute(name)) return name;

	// Otherwise relative to fluxloader.exe
	// If this errors it is catastrophic
	const __filename = url.fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	return path.join(__dirname, name);
}

function resolvePathInsideFluxloader(name) {
	// If absolute then return the path as is
	if (path.isAbsolute(name)) return name;

	// TODO: In the future this needs to accommodate for electron exe packaging

	// Otherwise relative to fluxloader.exe
	// If this errors it is catastrophic
	const __filename = url.fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	return path.join(__dirname, name);
}

function ensureDirectoryExists(dirPath) {
	// If this errors it is catastrophic
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
		logDebug(`Directory created: ${dirPath}`);
	}
}

function stringToHash(string) {
	let hash = 0;
	if (string.length == 0) return hash;
	for (let i = 0; i < string.length; i++) {
		const char = string.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return hash;
}

function updateObjectWithDefaults(defaultValues, target) {
	let modified = false;
	// If target doesn't have a property in the defaults then add it
	for (const key in defaultValues) {
		if (typeof defaultValues[key] === "object" && defaultValues[key] !== null) {
			if (!Object.hasOwn(target, key)) {
				target[key] = {};
				modified = true;
			}
			updateObjectWithDefaults(defaultValues[key], target[key]);
		} else {
			if (!Object.hasOwn(target, key)) {
				target[key] = defaultValues[key];
				modified = true;
			}
		}
	}
	// If target has a property source doesn't have, then remove it
	for (const key in target) {
		if (!Object.hasOwn(defaultValues, key)) {
			delete target[key];
			modified = true;
		}
	}
	return modified;
}

// =================== MAIN ===================

class ElectronFluxloaderAPI {
	static allEvents = ["fl:mod-loaded", "fl:mod-unloaded", "fl:all-mods-loaded", "fl:game-started", "fl:game-closed", "fl:page-redirect", "fl:config-changed"];
	events = undefined;
	modConfig = undefined;
	fileManager = gameFilesManager;

	constructor() {
		this.events = new EventBus();
		this.modConfig = new ElectronModConfigAPI();
	}

	addPatch(file, patch) {
		const tag = randomUUID();
		gameFilesManager.setPatch(file, tag, patch);
		return tag;
	}

	setPatch(file, tag, patch) {
		gameFilesManager.setPatch(file, tag, patch);
	}

	patchExists(file, tag) {
		gameFilesManager.patchExists(file, tag);
	}

	removePatch(file, tag) {
		gameFilesManager.removePatch(file, tag);
	}

	repatchAllFiles() {
		gameFilesManager.repatchAllFiles();
	}

	repatchFile(file) {
		gameFilesManager._repatchFile(file);
	}

	getGameBasePatch() {
		return gameFilesManager.gameBasePath;
	}

	getGameAsarPath() {
		return gameFilesManager.gameAsarPath;
	}

	getTempBasePath() {
		return gameFilesManager.tempBasePath;
	}

	getTempExtractedPath() {
		return gameFilesManager.tempExtractedPath;
	}

	handleBrowserIPC(channel, handler) {
		const fullChannel = `fl-mod:${channel}`;
		this._modIPCHandlers.push({ channel: fullChannel, handler });
		ipcMain.handle(fullChannel, handler);
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
		ipcMain.handle("fl-mod-config:get", (_, modID) => {
			logDebug(`Getting mod config remotely for ${modID}`);
			return this.get(modID);
		});

		ipcMain.handle("fl-mod-config:set", (_, modID, config) => {
			logDebug(`Setting mod config remotely for ${modID}`);
			return this.set(modID, config);
		});
	}

	get(modID) {
		const modIDPath = this.sanitizeModIDPath(modID);
		const baseModsPath = resolvePathRelativeToFluxloader(config.modsPath);
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

	set(modID, _config) {
		const modIDPath = this.sanitizeModIDPath(modID);
		const baseModsPath = resolvePathRelativeToFluxloader(config.modsPath);
		const modsConfigPath = path.join(baseModsPath, "config");
		ensureDirectoryExists(modsConfigPath);
		const modConfigPath = path.join(modsConfigPath, `${modIDPath}.json`);
		logDebug(`Setting mod config: ${modIDPath} -> ${modConfigPath}`);

		// If this fails treat it as catastrophic for now
		fs.writeFileSync(modConfigPath, JSON.stringify(_config, null, 4), "utf8");
		return true;
	}

	sanitizeModIDPath(modID) {
		return modID;
	}
}

class GameFilesManager {
	gameBasePath = undefined;
	gameAsarPath = undefined;
	tempBasePath = undefined;
	tempExtractedPath = undefined;
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
					this._resetFile(file);
				}
			}
		} catch (e) {
			return errorResponse(`Failed to reset game files to unmodified state: ${e.stack}`);
		}

		logDebug("Extracted app.asar set to default successfully");
		return successResponse("Game files reset to unmodified state");
	}

	clearPatches() {
		logDebug("Clearing all patches from game files");

		// This is not modifying the files, just clearing the in-memory patches
		for (const file in this.fileData) {
			this.fileData[file].patches.clear();
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
		return successResponse(`Patch '${tag}' set in file: ${file}`);
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
			logWarn(`Patch '${tag}' does not exist for file: ${file}`);
			return successResponse(`Patch '${tag}' does not exist for file: ${file}`);
		}

		logDebug(`Removing patch '${tag}' from file: ${file}`);
		this.fileData[file].patches.delete(tag);
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
		return successResponse("All game files repatched successfully");
	}

	async patchAndRunGameElectron() {
		if (!this.isGameExtracted) return errorResponse("Game files not extracted cannot process game app");

		// Here we basically want to isolate createWinow(), setupIpcHandlers(), and loadSettingsSync()
		// This is potentially very brittle and may need fixing in the future if main.js changes
		// We need to disable the default app listeners (so they're not ran when we run eval(...))
		// The main point is we want to ensure we open the game the same way the game does

		try {
			const replaceAllMain = (tag, from, to, matches = 1) => {
				const res = gameFilesManager.setPatch("main.js", tag, { type: "replace", from, to, expectedMatches: matches });
				if (!res.success) throw new Error(`Failed to set patch for main.js: ${res.message}`);
			};
			const replaceAllPreload = (tag, from, to, matches = 1) => {
				const res = gameFilesManager.setPatch("preload.js", tag, { type: "replace", from, to, expectedMatches: matches });
				if (!res.success) throw new Error(`Failed to set patch for main.js: ${res.message}`);
			};

			// Rename and expose the games main electron functions
			replaceAllMain("fluxloader:electron-globalize-main", "function createWindow ()", "globalThis.gameElectronFuncs.createWindow = function()");
			replaceAllMain("fluxloader:electron-globalize-ipc", "function setupIpcHandlers()", "globalThis.gameElectronFuncs.setupIpcHandlers = function()");
			replaceAllMain("fluxloader:electron-globalize-settings", "function loadSettingsSync()", "globalThis.gameElectronFuncs.loadSettingsSync = function()");
			replaceAllMain("fluxloader:electron-globalize-settings-calls", "loadSettingsSync()", "globalThis.gameElectronFuncs.loadSettingsSync()");

			// Block the automatic app listeners so we control when things happen
			replaceAllMain("fluxloader:electron-block-execution-1", "app.whenReady().then(() => {", "var _ = (() => {");
			replaceAllMain("fluxloader:electron-block-execution-2", "app.on('window-all-closed', function () {", "var _ = (() => {");

			// Ensure that the app thinks it is still running inside the app.asar
			// - Fix the userData path to be 'sandustrydemo' instead of 'sandustry-fluxloader'
			// - Override relative "preload.js" to absolute
			// - Override relative "index.html" to absolute
			replaceAllMain("fluxloader:electron-fix-paths-1", 'getPath("userData")', 'getPath("userData").replace("sandustry-fluxloader", "sandustrydemo")', 3);
			replaceAllMain("fluxloader:electron-fix-paths-2", "path.join(__dirname, 'preload.js')", `'${path.join(this.tempExtractedPath, "preload.js").replaceAll("\\", "/")}'`);
			replaceAllMain("fluxloader:electron-fix-paths-3", "loadFile('index.html')", `loadFile('${path.join(this.tempExtractedPath, "index.html").replaceAll("\\", "/")}')`);

			// Expose the games main window to be global
			replaceAllMain("fluxloader:electron-globalize-window", "const mainWindow", "globalThis.gameWindow", 1);
			replaceAllMain("fluxloader:electron-globalize-window-calls", "mainWindow", "globalThis.gameWindow", 4);

			// Make the menu bar visible
			// replaceAllMain("autoHideMenuBar: true,", "autoHideMenuBar: false,");

			// We're also gonna expose the ipcMain in preload.js
			replaceAllPreload(
				"fluxloader:exposeIPC",
				"save: (id, name, data)",
				`invoke: (msg, ...args) => ipcRenderer.invoke(msg, ...args),
				handle: (msg, func) => ipcRenderer.handle(msg, func),
				save: (id, name, data)`
			);

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
			logInfo(`Executing modified games electron main.js: ${gameElectronURL}`);
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
		logInfo(`Extracting game.asar to ${this.tempExtractedPath}`);
		try {
			asar.extractAll(this.gameAsarPath, this.tempExtractedPath);
		} catch (e) {
			throw new Error(`Error extracting game.asar: ${e.stack}`);
		}
		logDebug(`Successfully extracted app.asar`);
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
		this.fileData[file] = { fullPath, isModified: false, patches: new Map() };
	}

	_repatchFile(file) {
		if (!this.isGameExtracted) throw new Error("Game files not extracted yet cannot repatch");
		if (!this.fileData[file]) throw new Error(`File not initialized: ${file}`);
		logDebug(`Repatching file: ${file}`);
		this._resetFile(file);
		this._patchFile(file);
	}

	_resetFile(file) {
		logDebug(`Resetting file: ${file}`);

		if (!this.isGameExtracted) throw new Error("Game files not extracted yet cannot reset file");
		if (!this.isGameModified) return;
		if (!this.fileData[file]) throw new Error(`File not initialized ${file} cannot reset`);
		if (!this.fileData[file].isModified) return;

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

		const fullPath = this.fileData[file].fullPath;
		logDebug(`Applying ${this.fileData[file].patches.size} patches to file: ${fullPath}`);

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
	baseModsPath = undefined;
	modInfoSchema = undefined;
	installedMods = {};
	loadOrder = [];
	areModsLoaded = false;
	modContext = undefined;
	isPerformingActions = false;
	loadedModCount = 0;
	modScriptsImport = {};
	modElectronModules = {};

	// ------------ MAIN ------------

	async findInstalledMods() {
		if (this.isPerformingActions) return errorResponse("Cannot find installed mods while performing actions");

		this.installedMods = {};
		this.loadOrder = [];
		this.loadedModCount = 0;

		this.baseModsPath = resolvePathRelativeToFluxloader(config.modsPath);
		try {
			ensureDirectoryExists(this.baseModsPath);
		} catch (e) {
			return errorResponse(`Failed to ensure mods directory exists: ${e.stack}`);
		}

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
					logError(`Failed to initialize mod at path ${modPath}: ${res.message}, ignoring...`);
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

		const res = this._calculateLoadOrder();
		if (!res.success) return errorResponse(`Failed to calculate load order: ${res.message}`);
		this.loadOrder = res.data;

		this._applyModsScriptModifySchema();

		// Final report of installed mods
		const modCount = Object.keys(this.installedMods).length;
		const modListMessage = Object.values(this.installedMods)
			.map((mod) => `${!mod.isEnabled ? "(DISABLED) " : ""}${mod.info.modID} (v${mod.info.version})`)
			.join(", ");
		logInfo(`Successfully initialized ${modCount} mod${modCount == 1 ? "" : "s"}: [${modListMessage}]`);
		logInfo(`Mod load order: [ ${this.loadOrder.join(", ")} ]`);

		return successResponse(`Found ${modCount} mod${modCount == 1 ? "" : "s"}`);
	}

	async loadAllMods() {
		if (this.isPerformingActions) return errorResponse("Cannot load all mods while performing actions");
		if (this.areModsLoaded) return errorResponse("Cannot load mods, some mods are already loaded");

		this._applyModsScriptModifySchema();

		const enabledCount = this.loadOrder.filter((modID) => this.installedMods[modID].isEnabled).length;
		if (enabledCount == this.loadOrder.length) {
			logDebug(`Loading ${this.loadOrder.length} mods...`);
		} else {
			logDebug(`Loading ${enabledCount} / ${this.loadOrder.length} mods...`);
		}

		// Verify dependencies of all mods before starting to load them
		const res = this._verifyDependencies();
		if (!res.success) return errorResponse(`Failed to verify dependencies`);

		// Setup the context for the mods and expose whatever they need to access
		try {
			this.modContext = vm.createContext({ fluxloaderAPI, log, fs, path, randomUUID, url, process });
		} catch (e) {
			return errorResponse(`Failed to create mod context: ${e.stack}`);
		}

		for (const modID of this.loadOrder) {
			if (this.installedMods[modID].isEnabled) {
				const res = await this._loadMod(this.installedMods[modID]);
				if (!res.success) return errorResponse(`Failed to load mod ${modID}: ${res.message}`);
			}
		}

		this.areModsLoaded = true;
		fluxloaderAPI.events.trigger("fl:all-mods-loaded");
		logDebug(`All mods loaded successfully`);
		return successResponse(`Loaded ${this.loadedModCount} mod${this.loadedModCount == 1 ? "" : "s"}`);
	}

	unloadAllMods() {
		if (this.isPerformingActions) return errorResponse("Cannot unload all mods while performing actions");
		if (!this.areModsLoaded) {
			logWarn("No mods are currently loaded, nothing to unload");
			return successResponse("No mods are currently loaded, nothing to unload");
		}

		logDebug("Unloading all mods...");
		for (const modID of this.loadOrder) {
			if (this.installedMods[modID].isLoaded) {
				this._unloadMod(this.installedMods[modID]);
			}
		}

		this.areModsLoaded = false;
		this.modContext = undefined;
		this.loadedModCount = 0;
		this.modScriptsImport = {};
		this.modElectronModules = {};

		// Mods also have side effects on game files, IPC handlers, and events
		gameFilesManager.clearPatches();
		fluxloaderAPI._clearModIPCHandlers();
		fluxloaderAPI.events.clear();
		logDebug("All mods unloaded successfully");
		return successResponse("All mods unloaded successfully");
	}

	async fetchRemoteMods(config) {
		// Construct request for search, page, and size
		const query = { "modData.name": { $regex: "", $options: "i" } };
		const encodedQuery = encodeURIComponent(JSON.stringify(query));
		const url = `https://fluxloader.app/api/mods?search=${encodedQuery}&verified=null&page=${config.page}&size=${config.pageSize}`;

		// Request the remote mods from the API
		let responseData;
		try {
			const listStart = Date.now();
			const response = await fetch(url);
			responseData = await response.json();
			const listEnd = Date.now();
			logDebug(`Fetched ${responseData.mods.length} remote mods from API in ${listEnd - listStart}ms`);
		} catch (e) {
			return errorResponse(`Failed to fetch mods from the API: ${e.stack}`);
		}

		// Check it is a valid response
		if (!responseData || !Object.hasOwn(responseData, "resultsCount")) return errorResponse("Invalid response from remote mods API");

		// Render the description of each mod if requested
		if (config.rendered) {
			const renderStart = Date.now();
			for (const modEntry of responseData.mods) {
				if (modEntry.modData && modEntry.modData.description) {
					modEntry.renderedDescription = marked(modEntry.modData.description);
				} else {
					modEntry.renderedDescription = "";
				}
			}
			const renderEnd = Date.now();
			logDebug(`Rendered ${responseData.mods.length} descriptions for remote mods in ${renderEnd - renderStart}ms`);
		}

		logDebug(`Returning ${responseData.mods.length} total mods for page ${config.page} of size ${config.pageSize} (${responseData.resultsCount} total)`);
		return successResponse(`Fetched ${responseData.mods.length} remote mods`, responseData.mods);
	}

	async calculateModActions(mainActions) {
		logDebug(`Calculating mod actions: ${JSON.stringify(mainActions)}`);
		return mainActions;
	}

	async performModActions(allActions) {
		logDebug(`Performing mod actions: ${JSON.stringify(allActions)}`);
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
		if (!SchemaValidation.validate(modInfo, this.modInfoSchema, { unknownKeyMethod: "ignore" })) {
			return errorResponse(`Modinfo schema validation failed for mod: ${modInfoPath} - ${SchemaValidation.getLastError()}`);
		}

		// Store the base schema
		try {
			modInfo.configSchemaBase = JSON.parse(JSON.stringify(modInfo.configSchema));
		} catch (e) {
			return errorResponse(`Failed to clone mod config schema for mod: ${modInfoPath} - ${e.stack}`);
		}

		// Validate each entrypoint
		try {
			const validateEntrypoint = (type) => {
				const entrypointPath = modInfo[`${type}Entrypoint`];
				if (entrypointPath && !fs.existsSync(path.join(modPath, entrypointPath))) {
					throw new Error(`Mod ${modInfo.modID} has an invalid ${type}Entrypoint: ${entrypointPath}`);
				}
			};
			validateEntrypoint("electron");
			validateEntrypoint("game");
			validateEntrypoint("worker");
		} catch (e) {
			return errorResponse(`Mod ${modInfo.modID} has an invalid entrypoint: ${e.message}`);
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
				if (modInfo.dependencies[modID] == "soft") continue;
				if (!semver.valid(semver.coerce(modInfo.dependencies[modID]))) {
					return errorResponse(`Mod ${modInfo.modID} has an invalid dependency version for ${modID}: ${modInfo.dependencies[modID]}`);
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
			let config = fluxloaderAPI.modConfig.get(mod.info.modID);
			if (!SchemaValidation.validate(config, mod.info.configSchema)) {
				return errorResponse(`Mod ${mod.info.modID} config schema validation failed: ${e.message}`);
			}
			fluxloaderAPI.modConfig.set(mod.info.modID, config);
		}

		if (mod.info.electronEntrypoint) {
			try {
				// Load and start the electron entrypoint as a module in the context
				const entrypointPath = path.join(mod.path, mod.info.electronEntrypoint);
				const entrypointCode = fs.readFileSync(entrypointPath, "utf8");
				const identifier = url.pathToFileURL(entrypointPath).href;
				logDebug(`Loading electron entrypoint: ${identifier}`);
				const module = new vm.SourceTextModule(entrypointCode, { context: this.modContext, identifier });
				this.modElectronModules[mod.info.modID] = module;

				// This mod linking is for import calls inside the module
				// (May or may not work for relative imports)
				await module.link(async (specifier) => {
					return await import(specifier);
				});

				// We want to listen for any errors inside the module
				(async () => {
					try {
						await module.evaluate();
					} catch (e) {
						catchModError(`Error evaluating mod electron entrypoint`, mod.info.modID, e);
					}
				})();
			} catch (e) {
				return errorResponse(`Error loading electron entrypoint for mod ${mod.info.modID}: ${e.stack}`);
			}
		}

		mod.isLoaded = true;
		this.loadedModCount++;
		fluxloaderAPI.events.trigger("fl:mod-loaded", mod);
		return successResponse(`Mod ${mod.info.modID} loaded successfully`, mod);
	}

	_unloadMod(mod) {
		if (!mod.isLoaded) logWarn(`Mod ${mod.info.modID} is not loaded, cannot unload it`);
		logDebug(`Unloading mod: ${mod.info.modID}`);
		delete this.modScriptsImport[mod.info.modID];
		delete this.modElectronModules[mod.info.modID];
		fluxloaderAPI.events.trigger("fl:mod-unloaded", mod);
		mod.isLoaded = false;
		this.loadedModCount--;
	}

	_calculateLoadOrder() {
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
			if (currentVisited.has(modID)) return errorResponse(`Cyclic dependency at ${modID}`);
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

	_verifyDependencies() {
		// Verify that all dependencies are installed and valid
		for (const modID in this.installedMods) {
			const mod = this.installedMods[modID];
			if (mod.isEnabled && mod.info.dependencies) {
				for (const depModID in mod.info.dependencies) {
					if (!this.isModInstalled(depModID)) {
						return errorResponse(`Mod ${modID} depends on missing mod: ${depModID}`);
					}
					const depVersion = mod.info.dependencies[depModID];
					if (depVersion !== "soft" && !semver.satisfies(this.installedMods[depModID].info.version, depVersion)) {
						return errorResponse(`Mod ${modID} depends on ${depModID} with version ${depVersion}, but installed version is ${this.installedMods[depModID].info.version}`);
					}
					``;
				}
			}
		}
		logDebug("All mod dependencies verified successfully");
		return successResponse("All mod dependencies are valid");
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
					mod.renderedDescription = marked(mod.info.description);
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

		try {
			const modIDs = this.loadOrder.join(",");
			const url = `https://fluxloader.app/api/mods?option=versions&modids=${encodeURIComponent(modIDs)}`;
			const versionStart = Date.now();
			const response = await fetch(url);
			modVersions = await response.json();
			const versionEnd = Date.now();
			logDebug(`Fetched versions for ${this.loadOrder.length} installed mods in ${versionEnd - versionStart}ms`);
		} catch (e) {
			return errorResponse(`Failed to fetch mod versions from API: ${e.stack}`);
		}

		if (!modVersions || !Object.hasOwn(modVersions, "versions")) return errorResponse(`Invalid response from mod versions API: ${JSON.stringify(modVersions)}`);

		return successResponse(`Fetched versions for ${this.loadOrder.length} installed mods`, modVersions.versions);
	}

	async getModVersion(args) {
		const url = `https://fluxloader.app/api/mods?option=info&modid=${encodeURIComponent(args.modID)}&version=${encodeURIComponent(args.version)}`;

		// Fetch the mod version info from the API
		let responseData = null;
		try {
			const versionStart = Date.now();
			const response = await fetch(url);
			responseData = await response.json();
			const versionEnd = Date.now();
			logDebug(`Fetched version info for mod ${args.modID} (v${args.version}) in ${versionEnd - versionStart}ms`);
		} catch (e) {
			return errorResponse(`Failed to fetch mod version info from API: ${e.stack}`);
		}

		// Check if the response is valid
		if (!responseData || !Object.hasOwn(responseData, "mod")) return errorResponse(`Invalid response from mod version API: ${JSON.stringify(responseData)}`);

		// Render the description if requested
		if (args.rendered && responseData.mod.modData.description) {
			const renderStart = Date.now();
			responseData.mod.renderedDescription = marked(responseData.mod.modData.description);
			const renderEnd = Date.now();
			logDebug(`Rendered description for mod ${args.modID} (v${args.version}) in ${renderEnd - renderStart}ms`);
		}

		return successResponse(`Fetched version info for mod ${args.modID} (v${args.version})`, responseData.mod);
	}

	isModInstalled(modID) {
		return Object.hasOwn(this.installedMods, modID);
	}

	setModEnabled(modID, enabled) {
		// Ensure mod exists and should be toggled
		if (!this.isModInstalled(modID)) return errorResponse(`Mod ${modID} is not installed`);
		if (this.installedMods[modID].isEnabled === enabled) return successResponse(`Mod ${modID} is already in the desired state: ${enabled}`);

		logDebug(`Setting mod ${modID} enabled state to ${enabled}`);
		this.installedMods[modID].isEnabled = enabled;

		// Update mod schemas if needed
		this._applyModsScriptModifySchema();

		// Save this to the config file
		config.modsEnabled[modID] = enabled;
		const res = updateFluxloaderConfig();
		if (!res.success) return errorResponse(`Failed to update config after setting mod ${modID} enabled state: ${res.message}`);

		return successResponse(`Mod ${modID} enabled state set to ${enabled}`, this.installedMods[modID]);
	}
}

function setupFluxloaderEvents() {
	logDebug("Setting up fluxloader events");
	fluxloaderEvents = new EventBus();
	fluxloaderEvents.registerEvent("game-cleanup");
}

function catchModError(msg, modID, err) {
	let out = `Mod Error: ${msg}`;
	if (modID) out += ` (Mod ID: ${modID})`;
	if (err) {
		if (err.stack) {
			out += `\n${err.stack}`;
		} else {
			out += `\n${err}`;
		}
	}
	logError(out);
	closeGame();
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
		configPath = resolvePathRelativeToFluxloader(configPath);
		config = JSON.parse(fs.readFileSync(configPath, "utf8"));
	} catch (e) {
		logDebug(`Failed to read config file: ${e.stack}`);
		config = {};
	}

	// Validating against the schema will also set default values for any missing fields
	let valid = SchemaValidation.validate(config, configSchema, { unknownKeyMethod: "delete" });

	if (!valid) {
		// Applying the schema to an empty {} will set the default values
		logDebug(`Config file is invalid, resetting to default values: ${configPath}`);
		config = {};
		valid = SchemaValidation.validate(config, configSchema);
		if (!valid) {
			throw new Error(`Failed to validate empty config file: ${configPath}`);
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
		const asarPath = path.join(dir, "resources", "app.asar");
		if (!fs.existsSync(asarPath)) return null;
		return asarPath;
	}

	// Look in the configured directory for the games app.asar
	let fullGamePath = null;
	let asarPath = null;
	try {
		fullGamePath = resolvePathRelativeToFluxloader(config.gamePath);
		asarPath = findGameAsarInDirectory(fullGamePath);

		if (!asarPath) {
			logDebug(`Cannot find app.asar in configured directory: ${fullGamePath}`);
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
				logDebug(`app.asar not found in ${OS} steam path: ${gamePath}..`);
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

	logInfo(`Found game app.asar: ${asarPath}`);
	return successResponse(`Found game app.asar: ${asarPath}`, { fullGamePath, asarPath });
}

function addFluxloaderPatches() {
	logDebug("Adding fluxloader patches to game files...");

	// All of these set patches are turned into errors so we can deal with them all in 1 go in the catch block
	// All of these need to be applied successfully for the game to run properly
	try {
		// Enable the debug flag
		responseAsError(
			gameFilesManager.setPatch("js/bundle.js", "fluxloader:debugFlag", {
				type: "replace",
				from: "debug:{active:!1",
				to: "debug:{active:1",
			})
		);

		// Puts __debug into fluxloaderAPI.gameInstance
		responseAsError(
			gameFilesManager.setPatch("js/bundle.js", "fluxloader:loadGameInstance", {
				type: "replace",
				from: "}};var r={};",
				to: "}};fluxloader_onGameInstanceInitialized(__debug);var r={};",
			})
		);

		// Add game.js to bundle.js, and dont start game until it is ready
		const gameScriptPath = resolvePathRelativeToFluxloader("game.js").replaceAll("\\", "/");
		responseAsError(
			gameFilesManager.setPatch("js/bundle.js", "fluxloader:preloadBundle", {
				type: "replace",
				from: `(()=>{var e,t,n={8916`,
				to: `import "${gameScriptPath}";fluxloader_preloadBundle().then$$`,
				token: "$$",
			})
		);
		responseAsError(
			gameFilesManager.setPatch("js/bundle.js", "fluxloader:preloadBundleFinalize", {
				type: "replace",
				from: `)()})();`,
				to: `)()});`,
			})
		);

		// Expose the games world to bundle.js
		responseAsError(
			gameFilesManager.setPatch("js/bundle.js", "fluxloader:gameWorldInitialized", {
				type: "replace",
				from: `console.log("initializing workers"),`,
				to: `$$fluxloader_onGameWorldInitialized(s),`,
				token: "$$",
			})
		);

		// Listen for fluxloader worker messages in bundle.js
		responseAsError(
			gameFilesManager.setPatch("js/bundle.js", "fluxloader:onWorkerMessage", {
				type: "replace",
				from: "case f.InitFinished:",
				to: "case 'fluxloaderMessage':fluxloader_onWorkerMessage(r);break;$$",
				token: "$$",
			})
		);

		const workers = ["546", "336"];
		for (const worker of workers) {
			// Listen for fluxloader worker messages in each worker
			responseAsError(
				gameFilesManager.setPatch(`js/${worker}.bundle.js`, "fluxloader:onWorkerMessage", {
					type: "replace",
					from: `case i.dD.Init:`,
					to: `case 'fluxloaderMessage':fluxloader_onWorkerMessage(e);break;$$`,
					token: "$$",
				})
			);

			// Add worker.js to each worker, and dont start until it is ready
			const workerScriptPath = resolvePathRelativeToFluxloader(`worker.js`).replaceAll("\\", "/");
			responseAsError(
				gameFilesManager.setPatch(`js/${worker}.bundle.js`, "fluxloader:preloadBundle", {
					type: "replace",
					from: `(()=>{"use strict"`,
					to: `importScripts("${workerScriptPath}");fluxloader_preloadBundle().then$$`,
					token: "$$",
				})
			);
			responseAsError(
				gameFilesManager.setPatch(`js/${worker}.bundle.js`, "fluxloader:preloadBundleFinalize", {
					type: "replace",
					from: `()})();`,
					to: `()});`,
				})
			);
		}

		// Notify worker.js when the workers are ready
		// These are different for each worker
		responseAsError(
			gameFilesManager.setPatch(`js/336.bundle.js`, "fluxloader:workerInitialized", {
				type: "replace",
				from: `W.environment.postMessage([i.dD.InitFinished]);`,
				to: `fluxloader_onWorkerInitialized(W);$$`,
				token: "$$",
			})
		);
		responseAsError(
			gameFilesManager.setPatch(`js/546.bundle.js`, "fluxloader:workerInitialized2", {
				type: "replace",
				from: `t(performance.now());break;`,
				to: `t(performance.now());fluxloader_onWorkerInitialized(a);break;`,
			})
		);

		// Add React to globalThis
		responseAsError(
			gameFilesManager.setPatch("js/bundle.js", "fluxloader:exposeReact", {
				type: "replace",
				from: `var Cl,kl=i(6540)`,
				to: `globalThis.React=i(6540);var Cl,kl=React`,
			})
		);

		if (config.game.enableDebugMenu) {
			// Adds configrable zoom
			responseAsError(
				gameFilesManager.setPatch("js/bundle.js", "fluxloader:debugMenuZoom", {
					type: "replace",
					from: 'className:"fixed bottom-2 right-2 w-96 pt-12 text-white"',
					to: `$$,style:{zoom:"${config.game.debugMenuZoom * 100}%"}`,
					token: "$$",
				})
			);
		} else {
			// Disables the debug menu
			responseAsError(
				gameFilesManager.setPatch("js/bundle.js", "fluxloader:disableDebugMenu", {
					type: "replace",
					from: "function _m(t){",
					to: "$$return;",
					token: "$$",
				})
			);

			// Disables the debug keybinds
			responseAsError(
				gameFilesManager.setPatch("js/bundle.js", "fluxloader:disableDebugKeybinds", {
					type: "replace",
					from: "spawnElements:function(n,r){",
					to: "$$return false;",
					token: "$$",
				})
			);

			// Disables the pause camera keybind
			responseAsError(
				gameFilesManager.setPatch("js/bundle.js", "fluxloader:disablePauseCamera", {
					type: "replace",
					from: "e.debug.active&&(t.session.overrideCamera",
					to: "return;$$",
					token: "$$",
				})
			);

			// Disables the pause keybind
			responseAsError(
				gameFilesManager.setPatch("js/bundle.js", "fluxloader:disablePause", {
					type: "replace",
					from: "e.debug.active&&(t.session.paused",
					to: "return;$$",
					token: "$$",
				})
			);
		}

		// When the game page redirects trigger the fluxloader event
		responseAsError(
			gameFilesManager.setPatch("js/bundle.js", "fluxloader:onPageRedirect", {
				type: "replace",
				from: 'window.history.replaceState({},"",n),',
				to: "$$fluxloader_onPageRedirect(e),",
				token: "$$",
			})
		);

		// When the game page redirects trigger the fluxloader event
		responseAsError(
			gameFilesManager.setPatch("js/bundle.js", "fluxloader:electron-remove-error-require", {
				type: "replace",
				from: `try{(Hg=require("@emotion/is-prop-valid").default)&&(Vg=e=>e.startsWith("on")?!Gg(e):Hg(e))}catch(Cl){}`,
				to: "",
			})
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
				})
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
		if (eventName !== "fl:forward-log") logDebug(`Sending event ${eventName} to manager ${new Date().toISOString()}`);
		managerWindow.webContents.send(eventName, args);
	} catch (e) {
		logError(`Failed to send event ${eventName} to manager window: ${e.stack}`);
	}
}

// =================== ELECTRON  ===================

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

function setupElectronIPC() {
	logDebug("Setting up electron IPC handlers");

	ipcMain.removeAllListeners();

	const simpleEndpoints = {
		"fl:get-loaded-mods": (_) => modsManager.getLoadedMods(),
		"fl:get-installed-mods": (args) => modsManager.getInstalledMods(args),
		"fl:get-installed-mods-versions": (args) => modsManager.getInstalledModsVersions(args),
		"fl:fetch-remote-mods": async (args) => await modsManager.fetchRemoteMods(args),
		"fl:calculate-mod-actions": async (args) => await modsManager.calculateModActions(args),
		"fl:perform-mod-actions": async (args) => await modsManager.performModActions(args),
		"fl:get-mod-version": async (args) => await modsManager.getModVersion(args),
		"fl:find-installed-mods": async (_) => await modsManager.findInstalledMods(),
		"fl:trigger-page-redirect": (args) => fluxloaderAPI.events.trigger("fl:page-redirect", args),
		"fl:set-mod-enabled": async (args) => modsManager.setModEnabled(args.modID, args.enabled),
		"fl:start-game": (_) => startGame(),
		"fl:close-game": (_) => closeGame(),
		"fl:get-fluxloader-config": (_) => config,
		"fl:get-fluxloader-config-schema": (_) => configSchema,
		"fl:get-fluxloader-version": (_) => fluxloaderVersion,
		"fl:forward-log-to-manager": (args) => forwardLogToManager(args),
		"fl:request-manager-logs": (_) => logsForManager,
	};

	for (const [endpoint, handler] of Object.entries(simpleEndpoints)) {
		ipcMain.handle(endpoint, (_, args) => {
			logDebug(`Received ${endpoint}`);
			try {
				return handler(args);
			} catch (e) {
				logError(`Error in IPC handler for ${endpoint}: ${e.stack}, this shouldn't happen and will be ignored`);
				return null;
			}
		});
	}

	ipcMain.handle("fl:set-fluxloader-config", async (event, args) => {
		logDebug(`Received fl:set-fluxloader-config with args: ${JSON.stringify(args)}`);
		if (!configLoaded) {
			return errorResponse("Config not loaded yet");
		}
		if (!SchemaValidation.validate(args, configSchema)) {
			return errorResponse("Invalid config data provided");
		}
		config = args;
		return updateFluxloaderConfig();
	});
}

function startManager() {
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
				preload: resolvePathInsideFluxloader("manager/manager-preload.js"),
			},
		});

		managerWindow.webContents.setWindowOpenHandler(({ url }) => {
			shell.openExternal(url);
			return { action: "deny" };
		});

		managerWindow.on("closed", closeManager);
		managerWindow.loadFile("src/manager/manager.html");
		if (config.manager.openDevTools) managerWindow.openDevTools();
	} catch (e) {
		closeManager();
		return errorResponse(`Error starting manager window: ${e.stack}`);
	}

	logInfo(`Manager started successfully at ${new Date().toISOString()}`);
	return successResponse("Manager started successfully");
}

function closeManager() {
	if (!isManagerStarted) throw new Error("Cannot close manager, it is not started");
	logDebug("Cleaning up manager window");
	if (managerWindow && !managerWindow.isDestroyed()) {
		managerWindow.off("closed", closeManager);
		managerWindow.close();
	}
	managerWindow = null;
	if (config.closeGameWithManager && gameWindow) {
		logDebug("Closing game window with fluxloader window");
		closeGame();
	}
	isManagerStarted = false;
}

async function startGame() {
	if (isGameStarted) return errorResponse("Cannot start game, already running");

	logInfo("Starting sandustry");
	isGameStarted = true;

	// Startup the events, files, and mods
	try {
		fluxloaderAPI._initializeEvents();
		responseAsError(gameFilesManager.resetToBaseFiles());
		responseAsError(await gameFilesManager.patchAndRunGameElectron());
		responseAsError(addFluxloaderPatches());
		responseAsError(await modsManager.loadAllMods());
		responseAsError(gameFilesManager.repatchAllFiles());
		gameElectronFuncs.createWindow();
		gameWindow.on("closed", closeGame);
		if (config.game.openDevTools) gameWindow.openDevTools();
	} catch (e) {
		logError(`Error starting game window: ${e.stack}`);
		closeGame();
		return errorResponse(`Error starting game window`, null, false);
	}

	fluxloaderAPI.events.trigger("fl:game-started");
	logInfo(`Game started successfully at ${new Date().toISOString()}`);
	return successResponse("Game started successfully");
}

function closeGame() {
	if (!isGameStarted) return errorResponse("Cannot close game, it is not started");
	logDebug("Closing game window");
	if (gameWindow && !gameWindow.isDestroyed()) {
		gameWindow.off("closed", closeGame);
		gameWindow.close();
	}
	gameWindow = null;
	fluxloaderAPI.events.trigger("fl:game-closed");
	modsManager.unloadAllMods();
	trySendManagerEvent("fl:game-closed");
	isGameStarted = false;
}

function closeApp() {
	cleanupApp();
	app.quit();
}

function cleanupApp() {
	try {
		if (managerWindow) closeManager();
		if (gameWindow) closeGame();
		gameFilesManager.deleteFiles();
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

	// Wait for electron to be ready to go
	await app.whenReady();

	// The electron app as a whole closed when all windows are closed
	app.on("window-all-closed", () => {
		logInfo("All windows closed, exiting...");
		if (process.platform !== "darwin") {
			closeApp();
		}
	});

	// One-time fluxloader setup
	handleUncaughtErrors();
	loadFluxloaderConfig();
	setupFluxloaderEvents();

	let res = findValidGamePath();
	const { fullGamePath, asarPath } = res.data;

	gameFilesManager = new GameFilesManager(fullGamePath, asarPath);
	fluxloaderAPI = new ElectronFluxloaderAPI();
	modsManager = new ModsManager();

	responseAsError(await modsManager.findInstalledMods());
	setupElectronIPC();

	// Start manager or game window based on config
	if (config.loadIntoManager) {
		responseAsError(startManager());
	} else {
		responseAsError(await startGame());
	}
}

// =================== MAIN ===================

(async () => {
	await startApp();
})();
