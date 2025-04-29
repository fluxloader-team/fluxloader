import { app, BrowserWindow, ipcMain, screen } from "electron";
import path from "path";
import fs from "fs";
import process from "process";
import os from "os";
import asar from "asar";
import { EventBus, SchemaValidation } from "./common.js";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { marked } from "marked";

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
let preConfigLogLevel = "info";
let configPath = "modloader-config.json";
let configSchemaPath = "schema.modloader-config.json";
let modInfoSchemaPath = "schema.mod-info.json";
let logFilePath = undefined;
let config = undefined;
let configLoaded = false;
let modsManager = undefined;
let gameFileManager = undefined;
let modloaderWindow = undefined;
let hasRanOnce = false;

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

function setupLogFile() {
	if (!configLoaded) return;
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

globalThis.log = function (level, tag, message) {
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

function resolvePathInsideModloader(name) {
	// If absolute then return the path as is
	if (path.isAbsolute(name)) return name;

	// TODO: In the future this needs to accommodate for electron exe packaging

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

	getInstalledMods() {
		return modsManager.getInstalledMods();
	}

	getLoadedMods() {
		return modsManager.getLoadedMods();
	}

	getEnabledMods() {
		return modsManager.getEnabledMods();
	}
}

class ElectronModConfigAPI {
	constructor() {
		ipcMain.handle("ml-config:get-config", (event, modID) => {
			logDebug(`Getting mod config remotely for ${modID}`);
			return this.get(modID);
		});
		ipcMain.handle("ml-config:set-config", (event, modID, config) => {
			logDebug(`Setting mod config remotely for ${modID}`);
			return this.set(modID, config);
		});
	}

	get(modID) {
		const modIDPath = this.sanitizeModIDPath(modID);
		const baseModsPath = resolvePathRelativeToModloader(config.modsPath);
		const modsConfigPath = path.join(baseModsPath, "config");
		ensureDirectoryExists(modsConfigPath);
		const modConfigPath = path.join(modsConfigPath, `${modIDPath}.json`);
		logDebug(`Getting mod config: ${modIDPath} -> ${modConfigPath}`);
		try {
			if (fs.existsSync(modConfigPath)) {
				return JSON.parse(fs.readFileSync(modConfigPath, "utf8"));
			}
		} catch (e) {
			logError(`Error while parsing mod config: ${e.stack}`);
		}
		return {};
	}

	set(modID, _config) {
		const modIDPath = this.sanitizeModIDPath(modID);
		const baseModsPath = resolvePathRelativeToModloader(config.modsPath);
		const modsConfigPath = path.join(baseModsPath, "config");
		ensureDirectoryExists(modsConfigPath);
		const modConfigPath = path.join(modsConfigPath, `${modIDPath}.json`);
		logDebug(`Setting mod config: ${modIDPath} -> ${modConfigPath}`);

		try {
			fs.writeFileSync(modConfigPath, JSON.stringify(_config, null, 4), "utf8");
			return true;
		} catch (e) {
			logError(`Error while writing mod config: ${e.stack}`);
		}

		return false;
	}

	sanitizeModIDPath(modID) {
		return modID;
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
				logError(`Error deleting old temp directory: ${e.stack}`);
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
	installedMods = {};
	modScripts = {};
	loadOrder = [];
	loadedModCount = 0;
	modInfoSchema = undefined;

	async findInstalledMods() {
		this.installedMods = {};
		this.loadOrder = [];
		this.loadedModCount = 0;

		this.baseModsPath = resolvePathRelativeToModloader(config.modsPath);
		ensureDirectoryExists(this.baseModsPath);
		let modPaths = fs.readdirSync(this.baseModsPath);
		modPaths = modPaths.filter((p) => p !== "config");
		modPaths = modPaths.map((p) => path.join(this.baseModsPath, p));
		modPaths = modPaths.filter((p) => fs.statSync(p).isDirectory());
		logDebug(`Found ${modPaths.length} mod${modPaths.length === 1 ? "" : "s"} to initialize inside: ${this.baseModsPath}`);

		// Try and initialize each mod
		for (const modPath of modPaths) {
			try {
				// Initialize and save the mod
				const { mod, scripts } = await this._initializeMod(modPath);
				this.installedMods[mod.info.modID] = mod;
				this.modScripts[mod.info.modID] = scripts;

				// Check if the mod is disabled in the config (as-per a previous user choice)
				if (Object.hasOwn(config.modsEnabled, mod.info.modID) && !config.modsEnabled[mod.info.modID]) {
					logDebug(`Mod ${mod.info.modID} is disabled in the config`);
					mod.isEnabled = false;
				} else {
					mod.isEnabled = true;
				}

				// We want to make sure this mod is placed before any mod that depends on it
				// We start by putting it at the end, then we check each currently loaded mod
				let insertIndex = this.loadOrder.length;
				for (let i = 0; i < this.loadOrder.length; i++) {
					const otherMod = this.installedMods[this.loadOrder[i]];
					if (otherMod.info.dependencies && Object.keys(otherMod.info.dependencies).includes(mod.info.modID)) {
						if (i < insertIndex) insertIndex = i;
					}
				}
				this.loadOrder.splice(insertIndex, 0, mod.info.modID);
			} catch (e) {
				logError(`Error initializing mod at path ${modPath}: ${e.stack}`);
			}
		}

		// TODO: Here we should check dependencies and modloader versions probably

		// Final report of installed mods
		const modCount = Object.keys(this.installedMods).length;
		logInfo(
			`Successfully initialized ${modCount} mod${modCount == 1 ? "" : "s"}: [ ${Object.values(this.installedMods)
				.map((mod) => `${!mod.isEnabled ? "(DISABLED) " : ""}${mod.info.modID} (v${mod.info.version})`)
				.join(", ")} ]`
		);
		logInfo(`Mod load order: [ ${this.loadOrder.join(", ")} ]`);
	}

	async loadAllMods() {
		if (this.loadedModCount > 0) throw new Error("Cannot load mods, some mods are already loaded");

		const enabledCount = this.loadOrder.filter((modID) => this.installedMods[modID].isEnabled).length;
		if (enabledCount == this.loadOrder.length) {
			logDebug(`Loading ${this.loadOrder.length} mods...`);
		} else {
			logDebug(`Loading ${enabledCount} / ${this.loadOrder.length} mods...`);
		}

		for (const modID of this.loadOrder) {
			if (this.installedMods[modID].isEnabled) {
				await this._loadMod(this.installedMods[modID]);
			}
		}

		modloaderAPI.events.trigger("ml:onAllModsLoaded");
		logDebug(`All mods loaded successfully`);
	}

	unloadAllMods() {
		if (this.loadedModCount === 0) return;

		logDebug("Unloading all mods...");

		for (const modID of this.loadOrder) {
			if (this.installedMods[modID].isLoaded) {
				this._unloadMod(this.installedMods[modID]);
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

		for (const modID of newLoadOrder) {
			if (!this.hasMod(modID)) {
				throw new Error(`Invalid mod name in new order: ${modID}`);
			}
		}

		this.loadOrder = newLoadOrder;
	}

	hasMod(modID) {
		return Object.hasOwn(this.installedMods, modID);
	}

	logContents() {
		let outputString = "ModsManager Content\n\n";
		outputString += `  |  Variables\n`;
		outputString += `  |  |  Base Mods Path: ${this.baseModsPath}\n`;
		outputString += `  |  |  Load Order: [ ${this.loadOrder.join(", ")} ]\n`;

		outputString += `  |  \n`;
		outputString += `  |  Mods (${Object.keys(this.installedMods).length})\n`;
		for (const modID of this.loadOrder) {
			const mod = this.installedMods[modID];
			outputString += `  |  |  '${mod.info.modID}': ${mod.isLoaded ? "LOADED" : "UNLOADED"}, path: ${mod.path}\n`;
		}

		logDebug(outputString);
	}

	getInstalledMods() {
		return this.loadOrder.map((modID) => this.installedMods[modID]);
	}

	getLoadedMods() {
		return this.getInstalledMods().filter((mod) => mod.isLoaded);
	}

	getEnabledMods() {
		return this.getInstalledMods().filter((mod) => mod.isEnabled);
	}

	async getRemoteMods(config) {
		// config: { page, pageSize, search }

		const query = { "modData.name": { $regex: "", $options: "i" } };
		const encodedQuery = encodeURIComponent(JSON.stringify(query));
		const url = `https://fluxloader.app/api/mods?search=${encodedQuery}&verified=null&page=${config.page}&size=${config.pageSize}`;

		logDebug(`Fetching mods from API: ${url}`);
		let data;
		try {
			const response = await fetch(url);
			data = await response.json();
		} catch (e) {
			// This will be caught in the next check
		}

		if (!data || !Object.hasOwn(data, "resultsCount")) {
			logDebug(`Failed to fetch mods from the API: ${JSON.stringify(data)}`);
			return null;
		}

		logDebug(`Returning ${data.mods.length} total mods for page ${config.page} of size ${config.pageSize} (${data.resultsCount} total)`);
		return data.mods;
	}

	setModEnabled(modID, enabled) {
		// Ensure mod exists and should be toggled
		if (!this.hasMod(modID)) throw new Error(`Mod not found: ${modID}`);
		if (this.installedMods[modID].isEnabled === enabled) return false;

		logDebug(`Setting mod ${modID} enabled state to ${enabled}`);
		this.installedMods[modID].isEnabled = enabled;

		// Save this to the config file
		config.modsEnabled[modID] = enabled;
		updateModloaderConfig();

		return true;
	}

	// ------------ INTERNAL ------------

	async _initializeMod(modPath) {
		// Load the modInfo schema on the first call
		if (!this.modInfoSchema) {
			try {
				modInfoSchemaPath = resolvePathInsideModloader(modInfoSchemaPath);
				this.modInfoSchema = JSON.parse(fs.readFileSync(modInfoSchemaPath, "utf8"));
			} catch (e) {
				throw new Error(`Failed to read modinfo schema: ${e.stack}`);
			}
		}

		// Try and read the modinfo.json
		const modInfoPath = path.join(modPath, "modinfo.json");
		logDebug(`Initializing mod: ${modInfoPath}`);
		if (!fs.existsSync(modInfoPath)) throw new Error(`modinfo.json not found: ${modInfoPath}`);
		const modInfo = JSON.parse(fs.readFileSync(modInfoPath, "utf8"));

		// Validate it against the schema
		if (!SchemaValidation.validate(modInfo, this.modInfoSchema)) {
			throw new Error(`Invalid modinfo.json found: ${modInfoPath}`);
		}

		// Validate each entrypoint
		const validateEntrypoint = (type) => {
			const entrypointPath = modInfo[`${type}Entrypoint`];
			if (entrypointPath && !fs.existsSync(path.join(modPath, entrypointPath))) {
				throw new Error(`Mod defines ${type} entrypoint ${entrypointPath} but file not found: ${modPath}`);
			}
		};
		validateEntrypoint("electron");
		validateEntrypoint("browser");
		validateEntrypoint("worker");

		// Load the mod scripts if they exist
		let scripts = null;
		if (modInfo.scriptPath) {
			const scriptPath = path.join(modPath, modInfo.scriptPath);
			logDebug(`Loading mod script: ${scriptPath}`);
			scripts = await import(`file://${scriptPath}`);
		}

		return {
			scripts: scripts,
			mod: {
				info: modInfo,
				path: modPath,
				isInstalled: true,
				isEnabled: true,
				isLoaded: false,
			},
		};
	}

	async _loadMod(mod) {
		if (mod.isLoaded) throw new Error(`Mod already loaded: ${mod.info.modID}`);

		logDebug(`Loading mod: ${mod.info.modID}`);

		// if it defines a config schema then we need to validate it
		if (mod.info.configSchema) {
			if (this.modScripts[mod.info.modID] && this.modScripts[mod.info.modID].modifySchema) {
				logDebug(`Modifying schema for mod: ${mod.info.modID}`);
				this.modScripts[mod.info.modID].modifySchema(mod.info.configSchema);
			}

			logDebug(`Validating schema for mod: ${mod.info.modID}`);
			let config = modloaderAPI.config.get(mod.info.modID);
			SchemaValidation.validate(config, mod.info.configSchema);
			modloaderAPI.config.set(mod.info.modID, config);
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
		if (!mod.isLoaded) throw new Error(`Mod already unloaded: ${mod.info.modID}`);

		logDebug(`Unloading mod: ${mod.info.modID}`);

		modloaderAPI.events.trigger("ml:onModUnloaded", mod);

		mod.isLoaded = false;
		this.loadedModCount--;
	}
}

function loadModloaderConfig() {
	let configSchema = {};
	logDebug(`Reading config from: ${configPath}`);

	// We must be able to read the config schema
	try {
		configSchemaPath = resolvePathInsideModloader(configSchemaPath);
		configSchema = JSON.parse(fs.readFileSync(configSchemaPath, "utf8"));
	} catch (e) {
		throw new Error(`Failed to read config schema: ${e.stack}`);
	}

	// If we fail to read config just use {}
	try {
		configPath = resolvePathRelativeToModloader(configPath);
		config = JSON.parse(fs.readFileSync(configPath, "utf8"));
	} catch (e) {
		logDebug(`Failed to read config file: ${e.stack}`);
		config = {};
	}

	// Validating against the schema will also set default values for any missing fields
	let valid = SchemaValidation.validate(config, configSchema, { unknownKeyMethod: "delete" });

	if (!valid) {
		logDebug(`Config file is invalid, resetting to default values: ${configPath}`);
		config = {};
		valid = SchemaValidation.validate(config, configSchema);
		if (!valid) throw new Error(`Failed to validate empty config file: ${configPath}`);
	}

	updateModloaderConfig();
	configLoaded = true;
	logDebug(`Config loaded successfully: ${configPath}`);
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

	ipcMain.handle("ml-modloader:get-installed-mods", (event, args) => {
		logDebug("Received ml-modloader:get-installed-mods");
		return modsManager.getInstalledMods();
	});

	ipcMain.handle("ml-modloader:get-remote-mods", async (event, args) => {
		logDebug(`Received ml-modloader:get-remote-mods: ${JSON.stringify(args)}`);
		return await modsManager.getRemoteMods(args);
	});

	ipcMain.handle("ml-modloader:find-installed-mods", async (event, args) => {
		logDebug("Received ml-modloader:find-installed-mods");
		await modsManager.findInstalledMods();
	});

	ipcMain.handle("ml-modloader:set-mod-enabled", async (event, args) => {
		logDebug(`Received ml-modloader:set-mod-enabled: ${JSON.stringify(args)}`);
		try {
			return modsManager.setModEnabled(args.modID, args.enabled);
		} catch (e) {
			logError(`Error setting mod enabled state: ${e.stack}`);
			return false;
		}
	});

	ipcMain.handle("ml-modloader:start-game", (event, args) => {
		logDebug("Received ml-modloader:start-game");
		startGameWindow();
	});

	ipcMain.handle("ml-modloader:stop-game", (event, args) => {
		logDebug("Received ml-modloader:stop-game");
		closeGameWindow();
	});

	ipcMain.handle("ml-modloader:render-markdown", (event, args) => {
		logDebug("Received ml-modloader:render-markdown");
		return marked(args);
	});
}

function startModloaderWindow() {
	logDebug("Starting modloader window");

	try {
		const primaryDisplay = screen.getPrimaryDisplay();
		const { width, height } = primaryDisplay.workAreaSize;
		let modloaderWindowWidth = 1200;
		modloaderWindowWidth = Math.floor(width * 0.8);
		let modloaderWindowHeight = modloaderWindowWidth * (height / width);

		modloaderWindow = new BrowserWindow({
			width: modloaderWindowWidth,
			height: modloaderWindowHeight,
			autoHideMenuBar: true,
			webPreferences: {
				preload: resolvePathInsideModloader("modloader/modloader-preload.js"),
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

	// These are enabled for running the game
	process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
	app.commandLine.appendSwitch("enable-features", "SharedArrayBuffer");
	app.commandLine.appendSwitch("force_high_performance_gpu");

	// Wait for electron to be ready to go
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
	await modsManager.findInstalledMods();
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
