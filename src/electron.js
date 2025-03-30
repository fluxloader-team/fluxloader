import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import process from "process";
import os from "os";
import asar from "asar";
import { EventBus } from "./common.js";
import { fileURLToPath } from "url";

// ------------- MODDING DOCUMENTATION -------------

// NOTE: This file and branch is WIP, at no specific commit does it reflect the planned expected behaviour.

// Mods are defined in /mods/<modname> and require a 'modinfo.json' file:
// modinfo.json: {
//   name: string,
//   version: string,
//   author: string,
//   description?: string,
//   electronEntrypoint?: boolean,
//   browserEntrypoint?: boolean,
//   defaultConfig?: object,
// }

// Mods are ran inside the (electron) and the (browser) environment with their entrypoints files.
// These are alongside this index.js file, and alongside the the frontend browser game code.

// When a mod is 'loaded':
// - modinfo.json read and validated, exits if invalid
// - mod added into the mod load order
// - mod configs initialized with defaults
// - mod electron entrypoint is loaded to allow mods to register patches / hooks
//
// When a mod is set 'active' / 'inactive':
// - mod is set to active / inactive in its mod data
// - file manager is notified that the mod patch source is active / inactive
// - events are notified that the mod is active / inactive
//
// This means that loading / unloading adds / removes mod hooks
// and setting active / inactive only toggles them as active / inactive

// Be aware that the following error is related to an experimental feature in the devtools that is not supported by electron.
// - "Request Autofill.enable failed. {"code":-32601,"message":"'Autofill.enable' wasn't found"}", source: devtools://devtools/bundled/core/protocol_client/protocol_client.js (1)
// Is deemed not worthy to fix by the electron team and is not a bug in the modloader:
// - https://github.com/electron/electron/issues/41614#issuecomment-2006678760

// Before any modding occurs we patch the games electron main.js
// - Disable any immediately ran functions
// - Make the useful functions global so we can call them
// - Ensure the app thinks it is still running inside the app.asar
// These are all potentially flaky but is needed if we want to run the game as the original does

// ------------- VARIABLES -------------

globalThis.modloaderVersion = "2.0.0";
globalThis.modloaderAPI = undefined;
globalThis.gameElectronFuncs = undefined;
globalThis.gameWindow = undefined;

let logLevels = ["debug", "info", "warn", "error"];
let logFilePath = undefined;
let preConfigLogLevel = "info";
let configPath = "modloader-config.json";
let config = undefined;
let modsManager = undefined;
let gameFileManager = undefined;
let modloaderWindow = undefined;

let defaultConfig = {
	gamePath: ".",
	modsPath: "./mods",
	logging: {
		logToFile: true,
		logToConsole: true,
		consoleLogLevel: "info",
		fileLogLevel: "debug",
		logFilePath: "modloader.log",
	},
	application: {
		loadIntoModloader: true,
	},
	debug: {
		enableDebugMenu: false,
		debugMenuZoom: 0.8,
		openDevTools: false,
	},
};

// ------------- UTILTY -------------

function colour(text, colour) {
	const COLOUR_MAP = {
		red: "\x1b[31m",
		green: "\x1b[32m",
		yellow: "\x1b[33m",
		blue: "\x1b[34m",
		magenta: "\x1b[35m",
		cyan: "\x1b[36m",
		white: "\x1b[37m",
		grey: "\x1b[90m",
		black: "\x1b[30m",
		brightRed: "\x1b[91m",
		brightGreen: "\x1b[92m",
		brightYellow: "\x1b[93m",
		brightBlue: "\x1b[94m",
		brightMagenta: "\x1b[95m",
		brightCyan: "\x1b[96m",
		brightWhite: "\x1b[97m",
		reset: "\x1b[0m",
	};
	return `${COLOUR_MAP[colour]}${text}\x1b[0m`;
}

globalThis.log = function (level, tag, message) {
	function setupLogFile() {
		if (logFilePath) return;
		logFilePath = resolvePathRelativeToModloader(config.logging.logFilePath);
		try {
			fs.appendFileSync(logFilePath, new Date().toISOString() + "\n");
		} catch (e) {
			throw new Error(`Error writing to log file: ${e.stack}`);
		}
		const stat = fs.statSync(logFilePath);
		const fileSize = stat.size / 1024 / 1024;
		if (fileSize > 2) {
			logWarn(`Log file is over 2MB: ${logFilePath} (${fileSize.toFixed(2)}MB)`);
		}
		logDebug(`Modloader log path: ${logFilePath}`);
	}

	// Back out early if given wrong log level
	if (!logLevels.includes(level)) {
		throw new Error(`Invalid log level: ${level}`);
	}

	const levelIndex = logLevels.indexOf(level);
	const timestamp = new Date().toISOString().split("T")[1].split("Z")[0];
	const levelText = level.toUpperCase(); //.padEnd(5, " ");
	let header = `[${tag ? tag + " " : ""}${levelText} ${timestamp}]`;
	let headerColoured = colour("[", "grey") + colour(tag ? `${tag} ` : "", "blue") + colour(`${levelText} ${timestamp}]`, "grey");

	// Only log to file if defined by the config and level is allowed
	if (config && config.logging.logToFile) {
		if (levelIndex >= logLevels.indexOf(config.logging.fileLogLevel)) {
			if (!logFilePath) setupLogFile();
			fs.appendFileSync(logFilePath, `${header} ${message}\n`);
		}
	}

	// If config is not loaded then use the pre-config log level as the filter
	// Otherwise only log to console based on config level and console log flag
	let consoleLevelLimit = preConfigLogLevel;
	if (config) consoleLevelLimit = config.logging.consoleLogLevel;
	if (!config || config.logging.logToConsole) {
		if (levelIndex >= logLevels.indexOf(consoleLevelLimit)) {
			console.log(`${headerColoured} ${message}`);
		}
	}
};

globalThis.logDebug = (...args) => log("debug", "", args.join(" "));
globalThis.logInfo = (...args) => log("info", "", args.join(" "));
globalThis.logWarn = (...args) => log("warn", "", args.join(" "));
globalThis.logError = (...args) => log("error", "", args.join(" "));

function resolvePathRelativeToModloader(name) {
	// If absolute then return the path as is
	if (path.isAbsolute(name)) return name;

	// Otherwise relative to mod-loader.exe
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	return path.join(__dirname, name);
}

function ensureDirectoryExists(dirPath) {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
		logDebug(`Directory created: ${dirPath}`);
	}
}

function catchUnexpectedExits() {
	process.on("uncaughtException", (err) => {
		logError(`Uncaught exception: ${err.stack}`);
		cleanupApp();
		process.exit(1);
	});
	process.on("unhandledRejection", (err) => {
		logError(`Unhandled rejection: ${err.stack}`);
		cleanupApp();
		process.exit(1);
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

// ------------- MAIN -------------

class ModloaderElectronAPI {
	events = undefined;
	config = undefined;

	constructor() {
		logDebug(`Initializing electron modloader API`);

		this.events = new EventBus();
		this.config = new ModloaderElectronConfigAPI(this);

		for (const event of ["ml:onModLoaded", "ml:onModUnloaded", "ml:onAllModsLoaded", "ml:onSetActive", "ml:onModloaderClosed"]) {
			this.events.registerEvent("modloader", event);
		}
	}

	addPatch(source, file, patch) {
		gameFileManager.addPatch(source, file, patch);
	}

	repatchAll() {
		gameFileManager.repatchAll();
	}

	repatch(file) {
		gameFileManager.repatch(file);
	}

	async sendMessage(msg, ...args) {
		return await ipcMain.invoke(msg, ...args);
	}

	async listenMessage(msg, func) {
		return await ipcMain.handle(msg, func);
	}
}

class ModloaderElectronConfigAPI {
	constructor(modloaderAPI) {
		modloaderAPI.listenMessage("ml:get-config", async (event, modName) => {
			logDebug(`Getting mod config remotely for ${modName}`);
			return this.get(modName);
		});
		modloaderAPI.listenMessage("ml:set-config", async (event, modName, config) => {
			logDebug(`Setting mod config remotely for ${modName}`);
			return this.set(modName, config);
		});
	}

	get(modName) {
		const modNamePath = this.sanitizeModNamePath(modName);
		const baseModsPath = resolvePathRelativeToModloader(config.modsPath);
		const modsConfigPath = path.join(baseModsPath, "config");
		ensureDirectoryExists(modsConfigPath);
		const modConfigPath = path.join(modsConfigPath, `${modNamePath}.json`);
		logDebug(`Getting mod config: ${modNamePath} -> ${modConfigPath}`);
		try {
			if (fs.existsSync(modConfigPath)) {
				return JSON.parse(fs.readFileSync(modConfigPath, "utf8"));
			}
		} catch (e) {
			logWarn(`Error while parsing mod config: ${e.stack}`);
		}
		return {};
	}

	set(modName, config) {
		const modNamePath = this.sanitizeModNamePath(modName);
		const baseModsPath = resolvePathRelativeToModloader(config.modsPath);
		const modsConfigPath = path.join(baseModsPath, "config");
		ensureDirectoryExists(modsConfigPath);
		const modConfigPath = path.join(modsConfigPath, `${modNamePath}.json`);
		logDebug(`Setting mod config: ${modNamePath} -> ${modConfigPath}`);

		try {
			fs.writeFileSync(modConfigPath, JSON.stringify(config, null, 4), "utf8");
			return true;
		} catch (e) {
			logWarn(`Error while writing mod config: ${e.stack}`);
		}

		return false;
	}

	defineDefaults(modName, defaultConfig) {
		logDebug(`Defining default config for mod: ${modName}`);
		let existingConfig = this.get(modName);

		// If existingConfig is {} and defaultConfig is not {}
		if (Object.keys(existingConfig).length === 0 && Object.keys(defaultConfig).length > 0) {
			logDebug(`No existing config found for mod so initializing to defaults: ${modName}`);
			this.set(modName, defaultConfig);
		} else {
			const modified = updateObjectWithDefaults(defaultConfig, existingConfig);
			if (!modified) {
				logDebug(`Mod config is up-to-date: ${modName}`);
			} else {
				this.set(modName, existingConfig);
				logDebug(`Mod config updated to defaults successfully: ${modName}`);
			}
		}
	}

	sanitizeModNamePath(modName) {
		return modName;
	}
}

class GameFileManager {
	gameBasePath = undefined;
	gameAsarPath = undefined;
	tempBasePath = undefined;
	tempExtractedPath = undefined;
	fileData = {};
	patchSources = {};
	isTempInitialized = false;
	isGameExtracted = false;
	isGameModified = false;

	constructor(gameBasePath, gameAsarPath) {
		// The game base / asar path must be absolute and verified to exist
		this.gameBasePath = gameBasePath;
		this.gameAsarPath = gameAsarPath;
	}

	reset() {
		logDebug("Resetting extracted app.asar to default...");

		// Do not need to reset if we are extracted and not modified
		if (this.isGameExtracted && !this.isGameModified) return;

		// Ensure we have a temp directory (if not already)
		this._createTempDirectory();

		// Ensure the game is extracted (if not already)
		this._extractFiles();

		// If the files are modified then reset them specific files
		if (this.isGameModified) this._resetFiles();

		logDebug("Extracted app.asar set to default successfully");
	}

	addPatch(source, file, patch) {
		logDebug(`Adding patch to file: ${file}`);
		if (!this.isGameExtracted) {
			throw new Error("Game files not extracted yet cannot add patch");
		}
		if (!this.fileData[file]) {
			this._initializeFileData(file);
		}
		if (!this.patchSources[source]) {
			this.patchSources[source] = { isActive: true };
		}
		if (!this.patchSources[source].isActive) {
			logDebug(`Patch source not active: ${source}`);
		}
		this.fileData[file].patches.push({ source, patch });
	}

	repatchAll() {
		if (!this.isGameExtracted) {
			throw new Error("Game files not extracted yet cannot repatch all");
		}
		for (const file in this.fileData) {
			this.repatch(file);
		}
	}

	repatch(file) {
		logDebug(`Repatching file: ${file}`);
		if (!this.isGameExtracted) {
			throw new Error("Game files not extracted yet cannot repatch");
		}
		if (!this.fileData[file]) {
			throw new Error(`File not initialized: ${file}`);
		}
		this._resetFile(file);
		this._applyFilePatches(file);
	}

	setPatchSourceActive(source, isActive) {
		logDebug(`Setting patch source active: ${source} -> ${isActive}`);
		if (this.isGameModified) {
			throw new Error("Game files are modified cannot set patch source active");
		}
		if (!this.patchSources[source]) this.patchSources[source] = { isActive };
		else this.patchSources[source].isActive = isActive;
	}

	removePatchSource(source) {
		logDebug(`Removing patch source: ${source}`);
		if (!this.patchSources[source]) {
			throw new Error(`Patch source not found: ${source}`);
		}
		for (const file in this.fileData) {
			this.fileData[file].patches = this.fileData[file].patches.filter((p) => p.source != source);
		}
		delete this.patchSources[source];
	}

	async patchAndRunElectron() {
		if (!this.isGameExtracted) {
			throw new Error("Game files not extracted cannot process game app");
		}

		app.commandLine.appendSwitch("enable-features", "SharedArrayBuffer");
		app.commandLine.appendSwitch("force_high_performance_gpu");

		gameElectronFuncs = {};

		// Read the main.js file contents
		const mainPath = path.join(this.tempExtractedPath, "main.js");
		logInfo(`Processing games electron main.js: ${mainPath}`);
		let mainContent;
		try {
			mainContent = fs.readFileSync(mainPath, "utf8");
		} catch (e) {
			throw new Error(`Error reading main.js: ${e.stack}`);
		}

		// Read the preload.js file contents
		const preloadPath = path.join(this.tempExtractedPath, "preload.js");
		logInfo(`Processing games electron preload.js: ${preloadPath}`);
		let preloadContent;
		try {
			preloadContent = fs.readFileSync(preloadPath, "utf8");
		} catch (e) {
			throw new Error(`Error reading preload.js: ${e.stack}`);
		}
		const mainHash = stringToHash(mainContent);

		// Here we basically want to isolate createWindow(), setupIpcHandlers(), and loadSettingsSync()
		// This is potentially very brittle and may need fixing in the future if main.js changes
		// We need to disable the default app listeners (so they're not ran when we run eval(...))
		// The main point is we want to ensure we open the game the same way the game does

		// Rename and expose the games main electron functions
		mainContent = mainContent.replaceAll("function createWindow ()", "globalThis.gameElectronFuncs.createWindow = function()");
		mainContent = mainContent.replaceAll("function setupIpcHandlers()", "globalThis.gameElectronFuncs.setupIpcHandlers = function()");
		mainContent = mainContent.replaceAll("function loadSettingsSync()", "globalThis.gameElectronFuncs.loadSettingsSync = function()");
		mainContent = mainContent.replaceAll("loadSettingsSync()", "globalThis.gameElectronFuncs.loadSettingsSync()");

		// Block the automatic app listeners so we control when things happen
		mainContent = mainContent.replaceAll("app.whenReady().then(() => {", "var _ = (() => {");
		mainContent = mainContent.replaceAll("app.on('window-all-closed', function () {", "var _ = (() => {");

		// Ensure that the app thinks it is still running inside the app.asar
		// - Fix the userData path to be 'sandustrydemo' instead of 'mod-loader'
		// - Override relative "preload.js" to absolute
		// - Override relative "index.html" to absolute
		mainContent = mainContent.replaceAll('getPath("userData")', 'getPath("userData").replace("mod-loader", "sandustrydemo")');
		mainContent = mainContent.replaceAll("path.join(__dirname, 'preload.js')", `'${path.join(this.tempExtractedPath, "preload.js").replaceAll("\\", "/")}'`);
		mainContent = mainContent.replaceAll("loadFile('index.html')", `loadFile('${path.join(this.tempExtractedPath, "index.html").replaceAll("\\", "/")}')`);

		// Expose the games main window to be global
		mainContent = mainContent.replaceAll("const mainWindow", "globalThis.gameWindow");
		mainContent = mainContent.replaceAll("mainWindow", "globalThis.gameWindow");

		// Make the menu bar visible
		// mainContent = mainContent.replaceAll("autoHideMenuBar: true,", "autoHideMenuBar: false,");

		// We're also gonna expose the ipcMain in preload.js
		preloadContent = preloadContent.replaceAll(
			"save: (id, name, data)",
			`invoke: async (msg, ...args) => await ipcRenderer.invoke(msg, ...args),
			handle: async (msg, func) => await ipcRenderer.handle(msg, func),
			save: (id, name, data)`
		);

		// Overwrite the preload.js and main.js files
		logDebug(`Overwriting preload.js: ${preloadPath}`);
		try {
			fs.writeFileSync(mainPath, mainContent, "utf8");
			fs.writeFileSync(preloadPath, preloadContent, "utf8");
		} catch (e) {
			throw new Error(`Error writing modified electron files: ${e.stack}`);
		}

		// Run the code to register their functions
		gameElectronFuncs = {};
		logDebug(`Executing modified game electron main.js (hash=${mainHash})`);
		try {
			await import(`file://${mainPath}`);
		} catch (e) {
			throw new Error(`Error evaluating game main.js: ${e.stack}`);
		}
	}

	deleteFiles() {
		logDebug("Deleting game files...");
		this._deleteTempDirectory();
		this.fileData = {};
		this.patchSources = {};
		this.tempBasePath = undefined;
		this.tempExtractedPath = undefined;
		this.isTempInitialized = false;
		this.isGameExtracted = false;
		this.isGameModified = false;
	}

	logContents() {
		let outputString = "GameFileManager Content\n\n";
		outputString += `  |  Variables\n`;
		outputString += `  |  |  Game Base Path: ${this.gameBasePath}\n`;
		outputString += `  |  |  Game Asar Path: ${this.gameAsarPath}\n`;
		outputString += `  |  |  Temp Base Path: ${this.tempBasePath}\n`;
		outputString += `  |  |  Temp Extracted Path: ${this.tempExtractedPath}\n`;
		outputString += `  |  |  Is Temp Initialized: ${this.isTempInitialized}\n`;
		outputString += `  |  |  Is Game Extracted: ${this.isGameExtracted}\n`;
		outputString += `  |  |  Is Game Modified: ${this.isGameModified}\n`;

		outputString += `  |  \n`;
		outputString += `  |  Patch Sources (${Object.keys(this.patchSources).length})\n`;
		for (const source in this.patchSources) {
			outputString += `  |  |  ${source}: ${this.patchSources[source].isActive ? "ACTIVE" : "INACTIVE"}\n`;
		}

		outputString += `  |  \n`;
		outputString += `  |  File Data (${Object.keys(this.fileData).length})\n`;
		for (const file in this.fileData) {
			outputString += `  |  |  '${file}': ${this.fileData[file].isModified ? "MODIFIED" : "UNMODIFIED"}, patches (${this.fileData[file].patches.length})\n`;
			if (this.fileData[file].patches.length == 0) {
			} else {
				for (const patch of this.fileData[file].patches) {
					outputString += `  |  |  |  ${!this.patchSources[patch.source].isActive ? "(OFF) " : ""}${patch.source} -> ${JSON.stringify(patch.patch)}\n`;
				}
			}
		}
		logDebug(outputString);
	}

	static deleteOldTempDirectories() {
		logDebug("Deleting old temp directories...");
		let basePath;
		let files;
		try {
			basePath = os.tmpdir();
			files = fs.readdirSync(basePath);
		} catch (e) {
			throw new Error(`Error reading temp directory: ${e.stack}`);
		}
		for (const file of files) {
			try {
				if (file.startsWith("sandustry-modloader-")) {
					const fullPath = path.join(basePath, file);
					logDebug(`Deleting old temp directory: ${fullPath}`);
					fs.rmSync(fullPath, { recursive: true });
				}
			} catch (e) {
				logWarn(`Error deleting old temp directory: ${e.stack}`);
			}
		}
	}

	// ------------ INTERNAL ------------

	_createTempDirectory() {
		if (this.isTempInitialized) return;
		const newTempBasePath = path.join(os.tmpdir(), `sandustry-modloader-${Date.now()}`);
		logDebug(`Creating new temp directory: ${newTempBasePath}`);
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

	_extractFiles() {
		logDebug("Extracting game files...");
		if (!this.isTempInitialized) {
			throw new Error("Temp directory not initialized yet cannot extract files");
		}
		if (this.isGameExtracted) return;
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
		logDebug(`Initializing file data: ${file}`);
		if (!this.isGameExtracted) {
			throw new Error(`Game files not extracted yet cannot initialize file: ${file}`);
		}
		if (this.fileData[file]) {
			throw new Error(`File already initialized: ${file}`);
		}
		const fullPath = path.join(this.tempExtractedPath, file);
		if (!fs.existsSync(fullPath)) {
			throw new Error(`File not found: ${fullPath}`);
		}
		this.fileData[file] = { fullPath, isModified: false, patches: [] };
	}

	_resetFiles() {
		logDebug("Resetting all modified files...");
		if (!this.isGameExtracted) {
			throw new Error("Game files not extracted yet cannot reset files");
		}
		for (const file in this.fileData) {
			this._resetFile(file);
		}
	}

	_resetFile(file) {
		if (!this.isGameExtracted) {
			throw new Error("Game files not extracted yet cannot reset file");
		}
		if (!this.fileData[file]) {
			throw new Error(`File not initialized ${file} cannot reset`);
		}
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
		this.isGameModified = Object.values(this.fileData).some((f) => f.isModified);
	}

	_applyFilePatches(file) {
		if (!this.isGameExtracted) {
			throw new Error("Game files not extracted yet cannot apply patches");
		}
		if (!this.fileData[file]) {
			throw new Error(`File not initialized ${file} cannot apply patches`);
		}

		const fullPath = this.fileData[file].fullPath;
		const patches = this.fileData[file].patches;
		logDebug(`Applying ${patches.length} patches to file: ${fullPath}`);
		let fileContent;
		try {
			fileContent = fs.readFileSync(fullPath, "utf8");
		} catch (e) {
			throw new Error(`Error reading file: ${fullPath}`);
		}

		for (const patch of patches) {
			if (!this.patchSources[patch.source]) {
				logDebug(`Patch source not found: ${patch.source}`);
				continue;
			}
			if (!this.patchSources[patch.source].isActive) {
				logDebug(`Patch source not active: ${patch.source}`);
				continue;
			}
			fileContent = this._applyPatchToContent(fileContent, patch.patch);
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
		if (patch.type === "regex") {
			if (!Object.hasOwn(patch, "pattern") || !Object.hasOwn(patch, "replace")) {
				throw new Error(`Failed to apply regex patch. Missing "pattern" or "replace" field.`);
			}
			const regex = new RegExp(patch.pattern, "g");
			const matches = fileContent.match(regex);
			let actualMatches = matches ? matches.length : 0;
			let expectedMatches = patch.expectedMatches || 1;
			if (actualMatches != expectedMatches) {
				throw new Error(`Failed to apply regex patch: "${patch.pattern}" -> "${patch.replace}", ${actualMatches} != ${expectedMatches} match(s).`);
			}
			fileContent = fileContent.replace(regex, patch.replace);
		}

		// Run the function over the patch
		else if (patch.type === "process") {
			fileContent = patch.func(fileContent);
		}

		// Replace all instances of the string with the replacement string
		else if (patch.type === "replace") {
			if (!Object.hasOwn(patch, "from") || !Object.hasOwn(patch, "to")) {
				throw new Error(`Failed to apply replace patch. Missing "from" or "to" field.`);
			}
			let index = fileContent.indexOf(patch.from);
			let actualMatches = 0;
			while (index !== -1) {
				actualMatches++;
				fileContent = fileContent.slice(0, index) + patch.to + fileContent.slice(index + patch.from.length);
				index = fileContent.indexOf(patch.from, index + patch.to.length);
			}
			let expectedMatches = patch.expectedMatches || 1;
			if (actualMatches != expectedMatches) {
				throw new Error(`Failed to apply replace patch: "${patch.from}" -> "${patch.to}", ${actualMatches} != ${expectedMatches} match(s).`);
			}
		}

		return fileContent;
	}
}

class ModsManager {
	baseModsPath = undefined;
	mods = {};
	modsOrder = [];

	async reloadAllMods() {
		logDebug("Reloading all mods...");

		// Unload all the current mods
		for (const modName in this.mods) {
			this.unloadMod(modName);
		}

		// Clear out the mod data
		this.mods = {};
		this.modsOrder = [];

		// Find all potential mod folders in the base mod folder
		this.baseModsPath = resolvePathRelativeToModloader(config.modsPath);
		logDebug(`Checking for mods in folder: ${this.baseModsPath}`);
		ensureDirectoryExists(this.baseModsPath);
		let modPaths = [];
		try {
			// Ensure isnt 'config', map to absolute, and ensure is directory
			modPaths = fs.readdirSync(this.baseModsPath);
			modPaths = modPaths.filter((p) => p !== "config");
			modPaths = modPaths.map((p) => path.join(this.baseModsPath, p));
			modPaths = modPaths.filter((p) => fs.statSync(p).isDirectory());
		} catch (e) {
			throw new Error(`Error finding mods: ${e.stack}`);
		}

		// load each mod, and skip if it fails
		logDebug(`Found ${modPaths.length} mod${modPaths.length === 1 ? "" : "s"} to load`);
		for (const modPath of modPaths) {
			try {
				await this.loadMod(modPath);
			} catch (e) {
				logWarn(`Error loading mod at path ${modPath}: ${e.stack}`);
			}
		}

		logInfo(`Loaded ${Object.keys(this.mods).length} mod(s) from ${this.baseModsPath}: [ ${this.modsOrder.join(", ")} ]`);
		modloaderAPI.events.trigger("ml:onAllModsLoaded");
	}

	loadModInfo(modPath) {
		// Try and read the modinfo.json
		const modInfoPath = path.join(modPath, "modInfo.json");
		logDebug(`Loading modinfo.json: ${modInfoPath}`);

		if (!fs.existsSync(modInfoPath)) {
			throw new Error(`modInfo.json not found: ${modInfoPath}`);
		}

		const modInfoContent = fs.readFileSync(modInfoPath, "utf8");
		const modInfo = JSON.parse(modInfoContent);

		// Ensure mod has required modinfo
		if (!modInfo || !modInfo.name || !modInfo.version || !modInfo.author) {
			throw new Error(`Invalid modInfo.json found: ${modInfoPath}`);
		}

		// If mod info defines entrypoints check they both exist
		if (modInfo.electronEntrypoint && !fs.existsSync(path.join(modPath, modInfo.electronEntrypoint))) {
			throw new Error(`Mod defines electron entrypoint ${modInfo.electronEntrypoint} but file not found: ${modPath}`);
		}
		if (modInfo.browserEntrypoint && !fs.existsSync(path.join(modPath, modInfo.browserEntrypoint))) {
			throw new Error(`Mod defines browser entrypoint ${modInfo.browserEntrypoint} but file none found: ${modPath}`);
		}
		if (modInfo.workerEntrypoint && !fs.existsSync(path.join(modPath, modInfo.workerEntrypoint))) {
			throw new Error(`Mod defines worker entrypoint ${modInfo.workerEntrypoint} but file none found: ${modPath}`);
		}

		return modInfo;
	}

	async loadMod(modPath) {
		logDebug(`Loading mod from path: ${modPath}`);

		// Try load mod info - this can error if the mod info is invalid
		let modInfo = this.loadModInfo(modPath);

		// Ensure theres no mods with the same name
		if (this.hasMod(modInfo.name)) {
			throw new Error(`Mod at path ${modPath} has the same name as another mod: ${modInfo.name}`);
		}

		// Officially save the mod into the load order
		const mod = { info: modInfo, path: modPath, isActive: true };
		this.mods[modInfo.name] = mod;
		this.modsOrder.push(modInfo.name);

		// Load the mods default config
		modloaderAPI.config.defineDefaults(modInfo.name, modInfo.defaultConfig);

		// Load and run the electron entrypoint
		// Here mods will be able to add their patches / event listeners
		try {
			if (modInfo.electronEntrypoint) {
				const electronEntrypoint = path.join(mod.path, mod.info.electronEntrypoint);
				logDebug(`Loading electron entrypoint: ${electronEntrypoint}`);
				await import(`file://${electronEntrypoint}`);
			}
		} catch (e) {
			throw new Error(`Error loading electron entrypoint for mod ${modInfo.name}: ${e.stack}`);
		}

		// Trigger the mod loaded event finally
		modloaderAPI.events.triggerFor("ml:onModLoaded", modInfo.name);
	}

	unloadMod(modName) {
		if (!this.hasMod(modName)) {
			throw new Error(`Mod not found: ${modName}`);
		}

		logDebug(`Unloading mod: ${modName}`);

		modloaderAPI.events.removeParticipant(modName);
		gameFileManager.removePatchSource(modName);
		this.modsOrder = modsOrder.filter((m) => m !== modName);

		modloaderAPI.events.triggerFor("ml:onModUnloaded", modName);

		delete this.mods[modName];
	}

	reorderModsOrder(newModsOrder) {
		logDebug("Reordering mod load order...");

		if (newModsOrder.length !== this.modsOrder.length) {
			throw new Error(`Invalid new mod order length: ${newModsOrder.length} vs ${this.modsOrder.length}`);
		}

		for (const modName of newModsOrder) {
			if (!this.hasMod(modName)) {
				throw new Error(`Invalid mod name in new order: ${modName}`);
			}
		}

		this.modsOrder = newModsOrder;
	}

	setModActive(modName, isActive) {
		logDebug(`Setting mod active: ${modName} -> ${isActive}`);
		if (!this.hasMod(modName)) {
			throw new Error(`Mod not found: ${modName}`);
		}
		if (this.mods[modName].isActive === isActive) {
			logDebug(`Mod already set to ${isActive}: ${modName}`);
			return;
		}

		this.mods[modName].isActive = isActive;

		modloaderAPI.events.triggerFor("ml:onSetActive", modName, isActive);
		modloaderAPI.events.setParticipantActive(modName, isActive);
		gameFileManager.setPatchSourceActive(modName, isActive);
	}

	getModData() {
		let modData = [];
		for (const modName of this.modsOrder) {
			modData.push({
				...this.mods[modName].info,
				path: this.mods[modName].path,
				isActive: this.mods[modName].isActive,
			});
		}
		return modData;
	}

	hasMod(modName) {
		return Object.hasOwn(this.mods, modName);
	}
}

function readAndLoadConfig() {
	configPath = resolvePathRelativeToModloader(configPath);
	logDebug(`Reading config from: ${configPath}`);

	// If config file doesnt exist then create it with the defaults
	if (!fs.existsSync(configPath)) {
		fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 4));
		config = defaultConfig;
		logDebug(`No config found at '${configPath}', set to default`);
	}

	// If a config file exists compare it to the default
	else {
		config = JSON.parse(fs.readFileSync(configPath, "utf8"));
		let modified = updateObjectWithDefaults(defaultConfig, config);
		if (!modified) {
			logDebug(`Modloader config is up-to-date: ${configPath}`);
		} else {
			updateConfig();
		}
	}
}

function updateConfig() {
	fs.writeFileSync(configPath, JSON.stringify(config, null, 4), "utf8");
	logDebug(`Modloader config updated successfully: ${configPath}`);
}

function initializeGameFileManager() {
	// First cleanup any old temp directories
	GameFileManager.deleteOldTempDirectories();

	function findGameAsarInDirectory(dir) {
		if (!fs.existsSync(dir)) return null;
		const asarPath = path.join(dir, "resources", "app.asar");
		if (!fs.existsSync(asarPath)) return null;
		return asarPath;
	}

	// Look in the configured directory for the games app.asar
	let fullGamePath = resolvePathRelativeToModloader(config.gamePath);
	let asarPath = findGameAsarInDirectory(fullGamePath);
	if (!asarPath) {
		logDebug(`Cannot find app.asar in configured directory: ${fullGamePath}`);

		// Look in the default steam directory for the games app.asar
		logDebug("checking default steam directory...");
		const steamGamePath = path.join(process.env["ProgramFiles(x86)"], "Steam", "steamapps", "common", "Sandustry Demo");
		asarPath = findGameAsarInDirectory(steamGamePath);
		if (!asarPath) {
			throw new Error(`Cannot find app.asar in configured or default steam directory: ${fullGamePath} or ${steamGamePath}`);
		}

		// Update the config if we found the game in the default steam directory
		fullGamePath = steamGamePath;
		config.gamePath = steamGamePath;
		updateConfig();
	}

	logInfo(`Found game app.asar: ${asarPath}`);

	// Now initialize the file manager with the base / asar path
	gameFileManager = new GameFileManager(fullGamePath, asarPath);
	gameFileManager.reset();
}

function addModloaderPatches() {
	// Enable the debug flag
	gameFileManager.addPatch("modloader", "js/bundle.js", {
		type: "replace",
		from: "debug:{active:!1",
		to: "debug:{active:1",
	});

	// Add browser.js to bundle.js
	const browserScriptPath = resolvePathRelativeToModloader("browser.js").replaceAll("\\", "/");
	gameFileManager.addPatch("modloader", "js/bundle.js", {
		type: "replace",
		from: `(()=>{var e,t,n={8916`,
		to: `import "${browserScriptPath}";(()=>{var e,t,n={8916`,
	});

	// Expose the games world to bundle.js
	gameFileManager.addPatch("modloader", "js/bundle.js", {
		type: "replace",
		from: `s.environment.multithreading.simulation.startManager(s),`,
		to: `s.environment.multithreading.simulation.startManager(s),globalThis.onGameWorldInitialized(s),`,
	});

	// Listen for modloader worker messages in bundle.js
	gameFileManager.addPatch("modloader", "js/bundle.js", {
		type: "replace",
		from: "case f.InitFinished:",
		to: "case 'modloaderEvent':globalThis.onWorkerMessage(r);break;case f.InitFinished:",
	});

	const workers = ["546", "336"];
	for (const worker of workers) {

		// Listen for modloader worker messages in each worker
		gameFileManager.addPatch("modloader", `js/${worker}.bundle.js`, {
			type: "replace",
			from: `case i.dD.Init:`,
			to: `case 'modloaderEvent':globalThis.onWorkerMessage(e);break;case i.dD.Init:`,
		});

		// Add worker.js to each worker
		const workerScriptPath = resolvePathRelativeToModloader(`worker.js`).replaceAll("\\", "/");
		gameFileManager.addPatch("modloader", `js/${worker}.bundle.js`, {
			type: "replace",
			from: `(()=>{"use strict"`,
			to: `importScripts("${workerScriptPath}");(()=>{"use strict"`,
		});
	}

	// Add React to globalThis
	gameFileManager.addPatch("modloader", "js/bundle.js", {
		type: "replace",
		from: `var Cl,kl=i(6540)`,
		to: `globalThis.React=i(6540);var Cl,kl=React`,
	});

	if (config.debug.enableDebugMenu) {
		// Adds configrable zoom
		gameFileManager.addPatch("modloader", "js/bundle.js", {
			type: "replace",
			from: 'className:"fixed bottom-2 right-2 w-96 pt-12 text-white"',
			to: `className:"fixed bottom-2 right-2 w-96 pt-12 text-white",style:{zoom:"${config.debug.debugMenuZoom * 100}%"}`,
		});
	} else {
		// Disables the debug menu
		gameFileManager.addPatch("modloader", "js/bundle.js", {
			type: "replace",
			from: "function _m(t){",
			to: "function _m(t){return;",
		});

		// Disables the debug keybinds
		gameFileManager.addPatch("modloader", "js/bundle.js", {
			type: "replace",
			from: "spawnElements:function(n,r){",
			to: "spawnElements:function(n,r){return false;",
		});

		// Disables the pause camera keybind
		gameFileManager.addPatch("modloader", "js/bundle.js", {
			type: "replace",
			from: "e.debug.active&&(t.session.overrideCamera",
			to: "return;e.debug.active&&(t.session.overrideCamera",
		});

		// Disables the pause keybind
		gameFileManager.addPatch("modloader", "js/bundle.js", {
			type: "replace",
			from: "e.debug.active&&(t.session.paused",
			to: "return;e.debug.active&&(t.session.paused",
		});
	}
}

// ------------ ELECTRON  ------------

function setupElectronIPC() {
	logDebug("Setting up electron IPC handlers");

	// We may want to call this everytime we open the game due to the games
	// electron functions being potentially re-patched

	ipcMain.removeAllListeners();

	modloaderAPI.listenMessage("ml:get-mods", async (event, args) => {
		logDebug("Received ml:get-mods");
		return modsManager.getModData();
	});

	modloaderAPI.listenMessage("ml:toggle-mod", async (event, args) => {
		logDebug("Received ml:toggle-mod");
		const modName = args.name;
		const isActive = args.active;
		modsManager.setModActive(modName, isActive);
	});

	modloaderAPI.listenMessage("ml:reload-mods", async (event, args) => {
		logDebug("Received ml:reload-mods");
		modsManager.reloadAllMods();
	});

	modloaderAPI.listenMessage("ml:start-game", async (event, args) => {
		logDebug("Received ml:start-game");
		startGameWindow();
	});

	try {
		logDebug("Calling games electron setupIpcHandlers()");
		gameElectronFuncs.setupIpcHandlers();
	} catch (e) {
		throw new Error(`Error during setup of games electron setupIpcHandlers(), see _extractGameElectronFunctions(): ${e.stack}`);
	}
}

function startModloaderWindow() {
	try {
		logDebug("Starting modloader window: src/modloader/modloader.html");

		modloaderWindow = new BrowserWindow({
			width: 850,
			height: 500,
			autoHideMenuBar: true,
			webPreferences: {
				preload: resolvePathRelativeToModloader("modloader/modloader-preload.js"),
			},
		});

		modloaderWindow.on("closed", onModloaderWindowClosed);
		modloaderWindow.loadFile("src/modloader/modloader.html");
		modloaderWindow.webContents.openDevTools();
	} catch (e) {
		throw new Error(`Error starting modloader window: ${e.stack}`);
	}
}

function closeModloaderWindow() {
	modloaderWindow.close();
	modloaderWindow = null;
}

function onModloaderWindowClosed() {
	modloaderWindow = null;
}

function startGameWindow() {
	if (gameWindow != null) {
		logWarn("Cannot start game, already running");
		return;
	}

	logInfo("Starting game window...");
	gameFileManager.repatchAll();

	try {
		logDebug("Calling games electron createWindow()");
		gameElectronFuncs.createWindow();
		if (config.debug.openDevTools) gameWindow.openDevTools();
		gameWindow.on("closed", onGameWindowClosed);
	} catch (e) {
		throw new Error(`Error during games electron createWindow(), see _extractGameElectronFunctions(): ${e.stack}`);
	}
}

function closeGameWindow() {
	gameWindow.close();
	gameWindow = null;
}

function onGameWindowClosed() {
	gameWindow = null;
}

async function setupApp() {
	process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

	await app.whenReady();

	app.on("window-all-closed", () => {
		logInfo("All windows closed, exiting...");
		if (process.platform !== "darwin") {
			closeApp();
		}
	});
}

function closeApp() {
	cleanupApp();
	app.quit();
}

function cleanupApp() {
	try {
		modloaderAPI.events.trigger("ml:onModloaderClosed");
		if (modloaderWindow) closeModloaderWindow();
		if (gameWindow) closeGameWindow();
		gameFileManager.deleteFiles();
	} catch (e) {
		logError(`Error during cleanup: ${e.stack}`);
	}
	logDebug("Cleanup complete");
}

async function startApp() {
	logInfo(`Starting modloader electron ${modloaderVersion}...`);

	catchUnexpectedExits();
	readAndLoadConfig();

	initializeGameFileManager();
	await gameFileManager.patchAndRunElectron();
	addModloaderPatches();

	modloaderAPI = new ModloaderElectronAPI();
	modsManager = new ModsManager();
	await modsManager.reloadAllMods();

	// TODO: Remove these debug lines
	modsManager.setModActive("disabledmod", false);
	modloaderAPI.events.logContents();
	gameFileManager.logContents();

	await setupApp();
	setupElectronIPC();
	if (config.application.loadIntoModloader) {
		startModloaderWindow();
	} else {
		startGameWindow();
	}
}

// ------------ MAIN ------------

(async () => {
	await startApp();
})();
