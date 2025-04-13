import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import process from "process";
import os from "os";
import asar from "asar";
import { EventBus, ConfigTemplateHandler } from "./common.js";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

// ------------- MODDING DOCUMENTATION -------------

// NOTE: This file and branch is WIP, at no specific commit does it reflect the planned expected behaviour.

// Mods are defined in /mods/<modname> and require a 'modinfo.json' file.

// Mods are ran inside the (electron), (browser) and (worker) environment with their entrypoints files.

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
let hasRanOnce = false;

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

function colourText(text, colour) {
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
	let headerColoured = colourText("[", "grey") + colourText(tag ? `${tag} ` : "", "blue") + colourText(`${levelText} ${timestamp}]`, "grey");

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

class ElectronModloaderAPI {
	static allEvents = ["ml:onModLoaded", "ml:onModUnloaded", "ml:onAllModsLoaded", "ml:onAllModsUnloaded", "ml:onGameStarted", "ml:onGameClosed", "ml:onModloaderClosed"];
	events = undefined;
	config = undefined;
	fileManager = gameFileManager;

	constructor() {
		this.events = new EventBus();
		this.config = new ElectronModConfigAPI();

		for (const event of ElectronModloaderAPI.allEvents) {
			this.events.registerEvent(event);
		}
	}

	addPatch(file, patch) {
		const tag = randomUUID();
		gameFileManager.setPatch(file, tag, patch);
		return tag;
	}

	setPatch(file, tag, patch) {
		gameFileManager.setPatch(file, tag, patch);
	}

	removePatch(file, tag) {
		gameFileManager.removePatch(file, tag);
	}

	repatchAllFiles() {
		gameFileManager.repatchAllFiles();
	}

	handleBrowserIPC(channel, handler) {
		ipcMain.handle(`ml-mod:${channel}`, handler);
	}
}

class ElectronModConfigAPI {
	constructor() {
		ipcMain.handle("ml-config:get-config", (event, modName) => {
			logDebug(`Getting mod config remotely for ${modName}`);
			return this.get(modName);
		});
		ipcMain.handle("ml-config:set-config", (event, modName, config) => {
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

	set(modName, _config) {
		const modNamePath = this.sanitizeModNamePath(modName);
		const baseModsPath = resolvePathRelativeToModloader(config.modsPath);
		const modsConfigPath = path.join(baseModsPath, "config");
		ensureDirectoryExists(modsConfigPath);
		const modConfigPath = path.join(modsConfigPath, `${modNamePath}.json`);
		logDebug(`Setting mod config: ${modNamePath} -> ${modConfigPath}`);

		try {
			fs.writeFileSync(modConfigPath, JSON.stringify(_config, null, 4), "utf8");
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
		if (this.isGameExtracted && !this.isGameModified) return;

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

		logDebug("Extracted app.asar set to default successfully");
	}

	setPatch(file, tag, patch) {
		if (!this.isGameExtracted) throw new Error("Game files not extracted yet cannot add patch");

		if (!this.fileData[file]) this._initializeFileData(file);

		logDebug(`Setting patch '${tag}' in file: ${file}`);
		this.fileData[file].patches.set(tag, patch);
	}

	removePatch(file, tag) {
		if (!this.isGameExtracted) throw new Error("Game files not extracted yet cannot remove patch");

		if (!this.fileData[file]) this._initializeFileData(file);

		if (!this.fileData[file].patches.has(tag)) throw new Error(`Patch '${tag}' does not exist for file: ${file}`);

		logDebug(`Removing patch '${tag}' from file: ${file}`);
		this.fileData[file].patches.delete(tag);
	}

	repatchAllFiles() {
		if (!this.isGameExtracted) throw new Error("Game files not extracted yet cannot repatch all");

		logDebug("Repatching all files...");
		for (const file in this.fileData) this._repatchFile(file);
	}

	async patchAndRunGameElectron() {
		if (!this.isGameExtracted) throw new Error("Game files not extracted cannot process game app");

		// TODO: Once we have CJS in use again we want to shut down the main.js execution after we close the game
		// Currently if you try and run it again it won't work as expected as the main.js is cached
		if (hasRanOnce) return;

		gameElectronFuncs = {};

		// Here we basically want to isolate createWindow(), setupIpcHandlers(), and loadSettingsSync()
		// This is potentially very brittle and may need fixing in the future if main.js changes
		// We need to disable the default app listeners (so they're not ran when we run eval(...))
		// The main point is we want to ensure we open the game the same way the game does

		const replaceAllMain = (tag, from, to) => {
			gameFileManager.setPatch("main.js", tag, { type: "replace", from, to, expectedMatches: -1 });
		};
		const replaceAllPreload = (tag, from, to) => {
			gameFileManager.setPatch("preload.js", tag, { type: "replace", from, to, expectedMatches: -1 });
		};

		// Rename and expose the games main electron functions
		replaceAllMain("modloader:electron-globalize-main", "function createWindow ()", "globalThis.gameElectronFuncs.createWindow = function()");
		replaceAllMain("modloader:electron-globalize-ipc", "function setupIpcHandlers()", "globalThis.gameElectronFuncs.setupIpcHandlers = function()");
		replaceAllMain("modloader:electron-globalize-settings", "function loadSettingsSync()", "globalThis.gameElectronFuncs.loadSettingsSync = function()");
		replaceAllMain("modloader:electron-globalize-settings-calls", "loadSettingsSync()", "globalThis.gameElectronFuncs.loadSettingsSync()");

		// Block the automatic app listeners so we control when things happen
		replaceAllMain("modloader:electron-block-execution-1", "app.whenReady().then(() => {", "var _ = (() => {");
		replaceAllMain("modloader:electron-block-execution-2", "app.on('window-all-closed', function () {", "var _ = (() => {");

		// Ensure that the app thinks it is still running inside the app.asar
		// - Fix the userData path to be 'sandustrydemo' instead of 'mod-loader'
		// - Override relative "preload.js" to absolute
		// - Override relative "index.html" to absolute
		replaceAllMain("modloader:electron-fix-paths-1", 'getPath("userData")', 'getPath("userData").replace("mod-loader", "sandustrydemo")');
		replaceAllMain("modloader:electron-fix-paths-2", "path.join(__dirname, 'preload.js')", `'${path.join(this.tempExtractedPath, "preload.js").replaceAll("\\", "/")}'`);
		replaceAllMain("modloader:electron-fix-paths-3", "loadFile('index.html')", `loadFile('${path.join(this.tempExtractedPath, "index.html").replaceAll("\\", "/")}')`);

		// Expose the games main window to be global
		replaceAllMain("modloader:electron-globalize-window", "const mainWindow", "globalThis.gameWindow");
		replaceAllMain("modloader:electron-globalize-window-calls", "mainWindow", "globalThis.gameWindow");

		// Make the menu bar visible
		// replaceAllMain("autoHideMenuBar: true,", "autoHideMenuBar: false,");

		// We're also gonna expose the ipcMain in preload.js
		replaceAllPreload(
			"modloader:exposeIPC",
			"save: (id, name, data)",
			`invoke: (msg, ...args) => ipcRenderer.invoke(msg, ...args),
			handle: (msg, func) => ipcRenderer.handle(msg, func),
			save: (id, name, data)`
		);

		gameFileManager._repatchFile("main.js");
		gameFileManager._repatchFile("preload.js");

		// Run the code to register their functions
		const mainPath = path.join(this.tempExtractedPath, "main.js");
		gameElectronFuncs = {};
		logDebug(`Executing modified games electron main.js`);
		try {
			await import(`file://${mainPath}`);
		} catch (e) {
			throw new Error(`Error evaluating game main.js: ${e.stack}`);
		}

		// Now we need to run the setupIpcHandlers() function to register the ipcMain handlers
		try {
			logDebug("Calling games electron setupIpcHandlers()");
			gameElectronFuncs.setupIpcHandlers();
		} catch (e) {
			throw new Error(`Error during setup of games electron setupIpcHandlers(), see patchAndRunGameElectron(): ${e.stack}`);
		}
	}

	deleteFiles() {
		logDebug("Deleting game files...");
		this._deleteTempDirectory();
		this.fileData = {};
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
		outputString += `  |  File Data (${Object.keys(this.fileData).length})\n`;
		const patchCount = Object.values(this.fileData).reduce((acc, file) => acc + file.patches.size, 0);
		for (const file in this.fileData) {
			outputString += `  |  |  '${file}': ${this.fileData[file].isModified ? "MODIFIED" : "UNMODIFIED"}, patches (${patchCount})\n`;
			for (const patch of this.fileData[file].patches.values()) {
				outputString += `  |  |  |  ${JSON.stringify(patch)}\n`;
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
		if (this.isTempInitialized) throw new Error("Temp directory already initialized");

		const newTempBasePath = path.join(os.tmpdir(), `sandustry-modloader-${Date.now()}`);
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
		this.isGameModified = Object.values(this.fileData).some((f) => f.isModified);
	}

	_patchFile(file) {
		if (!this.isGameExtracted) throw new Error("Game files not extracted yet cannot apply patches");
		if (!this.fileData[file]) throw new Error(`File not initialized ${file} cannot apply patches`);
		if (this.fileData[file].isModified) throw new Error(`File already modified: ${file}`);

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

			// Replace all instances of the string with the replacement string
			case "replace": {
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
				if (expectedMatches > 0) {
					if (actualMatches != expectedMatches) {
						throw new Error(`Failed to apply replace patch: "${patch.from}" -> "${patch.to}", ${actualMatches} != ${expectedMatches} match(s).`);
					}
				}
				break;
			}
		}

		return fileContent;
	}
}

class ModsManager {
	baseModsPath = undefined;
	mods = {};
	loadOrder = [];
	loadedModCount = 0;
	scripts = {};

	refreshMods() {
		this.mods = {};
		this.loadOrder = [];
		this.loadedModCount = 0;

		this.baseModsPath = resolvePathRelativeToModloader(config.modsPath);
		ensureDirectoryExists(this.baseModsPath);
		let modPaths = fs.readdirSync(this.baseModsPath);
		modPaths = modPaths.filter((p) => p !== "config");
		modPaths = modPaths.map((p) => path.join(this.baseModsPath, p));
		modPaths = modPaths.filter((p) => fs.statSync(p).isDirectory());

		logDebug(`Found ${modPaths.length} mod${modPaths.length === 1 ? "" : "s"} to initialize inside: ${this.baseModsPath}`);

		for (const modPath of modPaths) {
			try {
				const mod = this._initializeMod(modPath);
				// Check for dependents of this mod and place this mod before them in the load order
				let lowestIndex = this.loadOrder.length;
				const mods = Object.values(this.mods);
				for (const modIndex in mods) {
					// Check if mod depends on mod being loaded
					if (Object.keys(mods[modIndex].info.dependencies).includes(mod.info.name)) {
						// Check if mod that is dependent on mod being loaded is lower in the loadOrder
						// if so, move lowest index so mod being loaded will load before them
						if (modIndex < lowestIndex) {
							lowestIndex = modIndex;
						}
					}
				}
				this.mods[mod.info.name] = mod;
				this.loadOrder.splice(lowestIndex, 0, mod.info.name);
			} catch (e) {
				logWarn(`Error initializing mod at path ${modPath}: ${e.stack}`);
			}
		}

		const modCount = Object.keys(this.mods).length;
		logInfo(`Successfully initialized ${modCount} mod${modCount == 1 ? "" : "s"}`);
		logInfo(`Mod load order: [ ${this.loadOrder.join(", ")} ]`);
	}

	async loadAllScripts() {
		for (const modName of this.loadOrder) {
			if (this.mods[modName].isEnabled) {
				await this._loadScript(this.mods[modName]);
			}
		}

		logDebug(`All scripts loaded successfully`);
	}

	async loadAllMods() {
		if (this.loadedModCount > 0) throw new Error("Cannot load mods, some mods are already loaded");

		const enabledCount = this.loadOrder.filter((modName) => this.mods[modName].isEnabled).length;
		if (enabledCount == this.loadOrder.length) {
			logDebug(`Loading ${this.loadOrder.length} mods...`);
		} else {
			logDebug(`Loading ${enabledCount} / ${this.loadOrder.length} mods...`);
		}

		for (const modName of this.loadOrder) {
			if (this.mods[modName].isEnabled) {
				await this._loadMod(this.mods[modName]);
			}
		}

		modloaderAPI.events.trigger("ml:onAllModsLoaded");
		logDebug(`All mods loaded successfully`);
	}

	unloadAllMods() {
		if (this.loadedModCount === 0) return;

		logDebug("Unloading all mods...");

		for (const modName of this.loadOrder) {
			if (this.mods[modName].isLoaded) {
				this._unloadMod(this.mods[modName]);
			}
		}

		modloaderAPI.events.trigger("ml:onAllModsUnloaded");
		logDebug("All mods unloaded successfully");
	}

	changeLoadOrder(newLoadOrder) {
		logDebug("Reordering mod load order...");

		if (newLoadOrder.length !== this.loadOrder.length) {
			throw new Error(`Invalid new mod order length: ${newLoadOrder.length} vs ${this.loadOrder.length}`);
		}

		for (const modName of newLoadOrder) {
			if (!this.hasMod(modName)) {
				throw new Error(`Invalid mod name in new order: ${modName}`);
			}
		}

		this.loadOrder = newLoadOrder;
	}

	hasMod(modName) {
		return Object.hasOwn(this.mods, modName);
	}

	logContents() {
		let outputString = "ModsManager Content\n\n";
		outputString += `  |  Variables\n`;
		outputString += `  |  |  Base Mods Path: ${this.baseModsPath}\n`;
		outputString += `  |  |  Load Order: [ ${this.loadOrder.join(", ")} ]\n`;

		outputString += `  |  \n`;
		outputString += `  |  Mods (${Object.keys(this.mods).length})\n`;
		for (const modName of this.loadOrder) {
			const mod = this.mods[modName];
			outputString += `  |  |  '${modName}': ${mod.isLoaded ? "LOADED" : "UNLOADED"}, path: ${mod.path}\n`;
		}

		logDebug(outputString);
	}

	getLoadedMods() {
		return Object.values(this.mods).filter((mod) => mod.isLoaded);
	}

	getLoadOrder() {
		return this.loadOrder.map((modName) => this.mods[modName]);
	}

	getMods() {
		return Object.values(this.mods);
	}

	// ------------ INTERNAL ------------

	_initializeMod(modPath) {
		// Try and read the modinfo.json
		const modInfoPath = path.join(modPath, "modinfo.json");
		logDebug(`Initializing mod: ${modInfoPath}`);

		if (!fs.existsSync(modInfoPath)) {
			throw new Error(`modinfo.json not found: ${modInfoPath}`);
		}

		const modInfoContent = fs.readFileSync(modInfoPath, "utf8");
		const modInfo = JSON.parse(modInfoContent);

		// Ensure mod has required mod info
		if (!modInfo || !modInfo.name || !modInfo.version || !modInfo.author) {
			throw new Error(`Invalid modinfo.json found: ${modInfoPath}`);
		}

		// Ensure mod name name is unique
		if (this.hasMod(modInfo.name)) {
			throw new Error(`Mod at path ${modPath} has the same name as another mod: ${modInfo.name}`);
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

		return { info: modInfo, path: modPath, isEnabled: true, isLoaded: false };
	}

	async _loadScript(mod) {
		if (this.scripts.hasOwnProperty(mod.info.name)) throw new Error(`Script already loaded: ${mod.info.name}`);

		logDebug(`Loading mod: ${mod.info.name}`);

		if (mod.info.script) {
			const scriptPath = path.join(mod.path, mod.info.script);
			logDebug(`Loading mod script: ${scriptPath}`);
			this.scripts[mod.info.name] = await import(`file://${scriptPath}`);
		}
	}

	async _loadMod(mod) {
		if (mod.isLoaded) throw new Error(`Mod already loaded: ${mod.info.name}`);

		logDebug(`Loading mod: ${mod.info.name}`);

		if (mod.info.defaultConfig) {
			modloaderAPI.config.defineDefaults(mod.info.name, mod.info.defaultConfig);
		}

		if (mod.info.electronEntrypoint) {
			const electronEntrypoint = path.join(mod.path, mod.info.electronEntrypoint);
			logDebug(`Loading electron entrypoint: ${electronEntrypoint}`);
			await import(`file://${electronEntrypoint}`);
		}

		mod.isLoaded = true;
		this.loadedModCount++;

		modloaderAPI.events.trigger("ml:onModLoaded", mod);
	}

	_unloadMod(mod) {
		if (!mod.isLoaded) throw new Error(`Mod already unloaded: ${mod.info.name}`);

		logDebug(`Unloading mod: ${mod.info.name}`);

		modloaderAPI.events.trigger("ml:onModUnloaded", mod);

		mod.isLoaded = false;
		this.loadedModCount--;
	}
}

function loadModloaderConfig() {
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
			updateModloaderConfig();
		}
	}
}

function updateModloaderConfig() {
	fs.writeFileSync(configPath, JSON.stringify(config, null, 4), "utf8");
	logDebug(`Modloader config updated successfully: ${configPath}`);
}

function findValidGamePath() {
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
			throw new Error(`Cannot find app.asar in configured or any default steam directory: ${fullGamePath}`);
		}

		// Update the config if we found the game in the default steam directory
		fullGamePath = steamGamePath;
		config.gamePath = steamGamePath;
		updateModloaderConfig();
	}

	logInfo(`Found game app.asar: ${asarPath}`);

	return { fullGamePath, asarPath };
}

function addModloaderPatches() {
	logDebug("Adding modloader patches to game files...");

	// Enable the debug flag
	gameFileManager.setPatch("js/bundle.js", "modloader:debugFlag", {
		type: "replace",
		from: "debug:{active:!1",
		to: "debug:{active:1",
	});

	// Puts __debug into modloaderAPI.gameInstance
	gameFileManager.setPatch("js/bundle.js", "modloader:loadGameInstance", {
		type: "replace",
		from: "}};var r={};",
		to: "}};modloader_onGameInstanceInitialized(__debug);var r={};",
	});

	// Add browser.js to bundle.js, and dont start game until it is ready
	const browserScriptPath = resolvePathRelativeToModloader("browser.js").replaceAll("\\", "/");
	gameFileManager.setPatch("js/bundle.js", "modloader:preloadBundle", {
		type: "replace",
		from: `(()=>{var e,t,n={8916`,
		to: `import "${browserScriptPath}";modloader_preloadBundle().then(()=>{var e,t,n={8916`,
	});
	gameFileManager.setPatch("js/bundle.js", "modloader:preloadBundleFinalize", {
		type: "replace",
		from: `)()})();`,
		to: `)()});`,
	});

	// Expose the games world to bundle.js
	gameFileManager.setPatch("js/bundle.js", "modloader:gameWorldInitialized", {
		type: "replace",
		from: `console.log("initializing workers"),`,
		to: `console.log("initializing workers"),modloader_onGameWorldInitialized(s),`,
	});

	// Listen for modloader worker messages in bundle.js
	gameFileManager.setPatch("js/bundle.js", "modloader:onWorkerMessage", {
		type: "replace",
		from: "case f.InitFinished:",
		to: "case 'modloaderMessage':modloader_onWorkerMessage(r);break;case f.InitFinished:",
	});

	const workers = ["546", "336"];
	for (const worker of workers) {
		// Listen for modloader worker messages in each worker
		gameFileManager.setPatch(`js/${worker}.bundle.js`, "modloader:onWorkerMessage", {
			type: "replace",
			from: `case i.dD.Init:`,
			to: `case 'modloaderMessage':modloader_onWorkerMessage(e);break;case i.dD.Init:`,
		});

		// Add worker.js to each worker, and dont start until it is ready
		const workerScriptPath = resolvePathRelativeToModloader(`worker.js`).replaceAll("\\", "/");
		gameFileManager.setPatch(`js/${worker}.bundle.js`, "modloader:preloadBundle", {
			type: "replace",
			from: `(()=>{"use strict"`,
			to: `importScripts("${workerScriptPath}");modloader_preloadBundle().then(()=>{"use strict"`,
		});
		gameFileManager.setPatch(`js/${worker}.bundle.js`, "modloader:preloadBundleFinalize", {
			type: "replace",
			from: `()})();`,
			to: `()});`,
		});
	}

	// Notify worker.js when the workers are ready
	// These are different for each worker
	gameFileManager.setPatch(`js/336.bundle.js`, "modloader:workerInitialized", {
		type: "replace",
		from: `W.environment.postMessage([i.dD.InitFinished]);`,
		to: `modloader_onWorkerInitialized(W);W.environment.postMessage([i.dD.InitFinished]);`,
	});
	gameFileManager.setPatch(`js/546.bundle.js`, "modloader:workerInitialized2", {
		type: "replace",
		from: `t(performance.now());break;`,
		to: `t(performance.now());modloader_onWorkerInitialized(a);break;`,
	});

	// Add React to globalThis
	gameFileManager.setPatch("js/bundle.js", "modloader:exposeReact", {
		type: "replace",
		from: `var Cl,kl=i(6540)`,
		to: `globalThis.React=i(6540);var Cl,kl=React`,
	});

	if (config.debug.enableDebugMenu) {
		// Adds configrable zoom
		gameFileManager.setPatch("js/bundle.js", "modloader:debugMenuZoom", {
			type: "replace",
			from: 'className:"fixed bottom-2 right-2 w-96 pt-12 text-white"',
			to: `className:"fixed bottom-2 right-2 w-96 pt-12 text-white",style:{zoom:"${config.debug.debugMenuZoom * 100}%"}`,
		});
	} else {
		// Disables the debug menu
		gameFileManager.setPatch("js/bundle.js", "modloader:disableDebugMenu", {
			type: "replace",
			from: "function _m(t){",
			to: "function _m(t){return;",
		});

		// Disables the debug keybinds
		gameFileManager.setPatch("js/bundle.js", "modloader:disableDebugKeybinds", {
			type: "replace",
			from: "spawnElements:function(n,r){",
			to: "spawnElements:function(n,r){return false;",
		});

		// Disables the pause camera keybind
		gameFileManager.setPatch("js/bundle.js", "modloader:disablePauseCamera", {
			type: "replace",
			from: "e.debug.active&&(t.session.overrideCamera",
			to: "return;e.debug.active&&(t.session.overrideCamera",
		});

		// Disables the pause keybind
		gameFileManager.setPatch("js/bundle.js", "modloader:disablePause", {
			type: "replace",
			from: "e.debug.active&&(t.session.paused",
			to: "return;e.debug.active&&(t.session.paused",
		});
	}
}

// ------------ ELECTRON  ------------

function setupElectronIPC() {
	logDebug("Setting up electron IPC handlers");

	ipcMain.removeAllListeners();

	ipcMain.handle("ml-modloader:get-loaded-mods", (event, args) => {
		logDebug("Received ml-modloader:get-loaded-mods");
		return modsManager.getLoadedMods();
	});

	ipcMain.handle("ml-modloader:get-load-order", (event, args) => {
		logDebug("Received ml-modloader:get-load-rder");
		return modsManager.getLoadOrder();
	});

	ipcMain.handle("ml-modloader:get-mods", (event, args) => {
		logDebug("Received ml-modloader:get-mods");
		return modsManager.getMods();
	});

	ipcMain.handle("ml-modloader:refresh-mods", (event, args) => {
		logDebug("Received ml-modloader:refresh-mods");
		modsManager.refreshMods();
		return modsManager.getMods();
	});

	ipcMain.handle("ml-modloader:start-game", (event, args) => {
		logDebug("Received ml-modloader:start-game");
		startGameWindow();
	});

	ipcMain.handle("ml-modloader:stop-game", (event, args) => {
		logDebug("Received ml-modloader:stop-game");
		closeGameWindow();
	});
}

function startModloaderWindow() {
	logDebug("Starting modloader window");

	try {
		modloaderWindow = new BrowserWindow({
			width: 1700,
			height: 850,
			autoHideMenuBar: true,
			webPreferences: {
				preload: resolvePathRelativeToModloader("modloader/modloader-preload.js"),
			},
		});
		modloaderWindow.on("closed", cleanupModloaderWindow);
		modloaderWindow.loadFile("src/modloader/modloader.html");
	} catch (e) {
		cleanupModloaderWindow();
		throw new Error(`Error starting modloader window: ${e.stack}`);
	}
}

function closeModloaderWindow() {
	modloaderWindow.close();
	cleanupModloaderWindow();
}

function cleanupModloaderWindow() {
	modloaderWindow = null;
}

async function startGameWindow() {
	if (gameWindow != null) throw new Error("Cannot start game, already running");

	logInfo("Starting game window");

	gameFileManager.resetToBaseFiles();
	await gameFileManager.patchAndRunGameElectron();
	addModloaderPatches();
	await modsManager.loadAllScripts();
	await modsManager.loadAllMods();
	gameFileManager.repatchAllFiles();
	modloaderAPI.events.trigger("ml:onGameStarted");

	try {
		gameElectronFuncs.createWindow();
		gameWindow.on("closed", cleanupGameWindow);
		if (config.debug.openDevTools) gameWindow.openDevTools();
		hasRanOnce = true;
	} catch (e) {
		cleanupGameWindow();
		throw new Error(`Error during games electron createWindow(), see patchAndRunGameElectron(): ${e.stack}`);
	}
}

function closeGameWindow() {
	if (!gameWindow) return;
	gameWindow.close();
	cleanupGameWindow();
}

function cleanupGameWindow() {
	gameWindow = null;
	modsManager.unloadAllMods();
	modloaderAPI.events.trigger("ml:onGameClosed");
	modloaderAPI.events.reset();
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
		modsManager.unloadAllMods();
	} catch (e) {
		logError(`Error during cleanup: ${e.stack}`);
	}
	logDebug("Cleanup complete");
}

async function startApp() {
	logInfo(`Starting electron modloader ${modloaderVersion}`);

	// Wait for electron to be ready to go
	process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
	app.commandLine.appendSwitch("enable-features", "SharedArrayBuffer");
	app.commandLine.appendSwitch("force_high_performance_gpu");
	await app.whenReady();
	app.on("window-all-closed", () => {
		logInfo("All windows closed, exiting...");
		if (process.platform !== "darwin") {
			closeApp();
		}
	});

	// One-time modloader setup
	catchUnexpectedExits();
	loadModloaderConfig();
	const { fullGamePath, asarPath } = findValidGamePath();
	gameFileManager = new GameFileManager(fullGamePath, asarPath);
	modloaderAPI = new ElectronModloaderAPI();
	modsManager = new ModsManager();
	modsManager.refreshMods();
	setupElectronIPC();

	// Start the windows now everything is setup
	if (config.application.loadIntoModloader) {
		startModloaderWindow();
	} else {
		await startGameWindow();
	}
}

// ------------ MAIN ------------

(async () => {
	await startApp();
})();
