const { app, BrowserWindow, ipcMain } = require("electron");
globalThis.path = require("path");
globalThis.fs = require("fs");
globalThis.process = require("process");
globalThis.os = require("os");
globalThis.asar = require("asar");

// ------------- MODDING DOCUMENTATION -------------

// NOTE: This file and branch is WIP, at no specific commit does it reflect the planned expected behaviour.

// Mods are defined in a /MODFOLDER directory with a required modinfo.json

// /MODFOLDER/modinfo.json: {
//   name: string,
//   version: string,
//   author: string,
//   description?: string,
//   electronEntrypoint?: boolean,
//   browserEntrypoint?: boolean
// }

// Mods are ran inside the (electron) and the (browser) environment with their entrypoints.
// See the Modloader API section for how to interact with the modloader.

// ------------- VARIABLES -------------

globalThis.modloaderVersion = "2.0.0";
globalThis.gameElectronFuncs = undefined;
globalThis.modloaderAPI = undefined;

let logLevels = ["debug", "info", "warn", "error"];
let logFilePath = undefined;
let preConfigLogLevel = "info";
let configPath = "modloader-config.json";
let config = undefined;
let mods = {};
let modsOrder = [];
let gameFileManager = undefined;
let gameWindow = undefined;
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
};

// ------------ UTILTY ------------

globalThis.log = function (level, tag, message) {
	if (!logLevels.includes(level)) {
		throw new Error(`Invalid log level: ${level}`);
	}

	const levelIndex = logLevels.indexOf(level);
	const timestamp = new Date().toISOString().split("T")[1].split("Z")[0];
	const finalMessage = `[${level.toUpperCase().padEnd(6, " ")} ${timestamp}${tag ? "  " + tag : ""}] ${message}`;

	// Only log to file if defined by the config and level is allowed
	if (config && config.logging.logToFile) {
		const fileLogLevel = logLevels.indexOf(config.logging.fileLogLevel);
		if (levelIndex >= fileLogLevel) {
			// Setup the global log file path the first time we need it
			if (!logFilePath) {
				logFilePath = resolvePathRelativeToModloader(config.logging.logFilePath);
				try {
					fs.appendFileSync(logFilePath, new Date().toISOString() + "\n");
				} catch (e) {
					throw new Error(`Error writing to log file: ${e.stack}`);
				}

				// Check the size of the log file for a warning
				const stat = fs.statSync(logFilePath);
				const fileSize = stat.size / 1024 / 1024;
				if (fileSize > 2) {
					logWarn(`Log file is over 2MB: ${logFilePath} (${fileSize.toFixed(2)}MB)`);
				}

				logDebug(`Log file path set to: ${logFilePath}`);
			}

			fs.appendFileSync(logFilePath, finalMessage + "\n");
		}
	}

	// If config is not loaded then use the pre-config log level and always log to console
	// Otherwise only log to console if defined by the config and level is allowed
	let consoleLevel = preConfigLogLevel;
	if (config) consoleLevel = config.logging.consoleLogLevel;
	if (!config || config.logging.logToConsole) {
		const consoleLevelIndex = logLevels.indexOf(consoleLevel);
		if (levelIndex >= consoleLevelIndex) {
			console.log(finalMessage);
		}
	}

	return finalMessage;
};

globalThis.logDebug = (...args) => log("debug", "", args.join(" "));
globalThis.logInfo = (...args) => log("info", "", args.join(" "));
globalThis.logWarn = (...args) => log("warn", "", args.join(" "));
globalThis.logError = (...args) => log("error", "", args.join(" "));

function resolvePathRelativeToModloader(name) {
	// Relative to mod-loader.exe
	return path.join(__dirname, name);
}

function ensureDirectoryExists(dirPath) {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
		logDebug(`Directory created: ${dirPath}`);
	} else {
		logDebug(`Directory already exists: ${dirPath}`);
	}
}

function catchUnexpectedExits() {
	process.on("uncaughtException", (err) => {
		logError(`Uncaught exception: ${err.stack}`);
		unexpectedCleanupApp();
		process.exit(1);
	});
	process.on("unhandledRejection", (err) => {
		logError(`Unhandled rejection: ${err.stack}`);
		unexpectedCleanupApp();
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
	for (i = 0; i < string.length; i++) {
		char = string.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return hash;
}

// ------------ MODLOADER API ------------

class ModloaderEvents {
	static electronEvents = ["ml:onModLoaded", "ml:onModUnloaded", "ml:onAllModsLoaded", "ml:onSetActive"];
	static browserEvents = ["ml:onMenuLoaded", "ml:onGameLoaded"];

	events = [];
	listeners = {};

	constructor(environmentType) {
		let envEvents = environmentType === "electron" ? ModloaderEvents.electronEvents : ModloaderEvents.browserEvents;
		for (const event of envEvents) {
			this.registerEvent(event);
		}
	}

	registerEvent(event) {
		logDebug(`Registering event: ${event}`);
		if (this.events.includes(event)) {
			throw new Error(`Event already registered: ${event}`);
		}
		this.events.push(event);
		this.listeners[event] = {};
	}

	trigger(event, ...args) {
		logDebug(`Triggering event: ${event}`);
		if (!this.events.includes(event)) {
			throw new Error(`Unallowed event called: ${event}`);
		}
		for (const listener in this.listeners[event]) {
			for (const func of this.listeners[event][listener]) {
				func(...args);
			}
		}
	}

	triggerFor(event, listener, ...args) {
		logDebug(`Triggering event for: ${event} -> ${listener}`);
		if (!this.events.includes(event)) {
			throw new Error(`Unallowed event called: ${event}`);
		}
		if (Object.hasOwn(this.listeners[event], listener)) {
			for (const func of this.listeners[event][listener]) {
				func(...args);
			}
		}
	}

	on(listener, event, func) {
		logDebug(`Adding listener: ${event} -> ${listener}`);

		if (!this.events.includes(event)) {
			throw new Error(`Unallowed event called: ${event}`);
		}

		if (!Object.hasOwn(this.listeners[event], listener)) {
			this.listeners[event][listener] = [];
		}

		this.listeners[event][listener].push(func);
	}

	off(listener, event) {
		logDebug(`Removing listener: ${event} -> ${listener}`);
		if (!this.events.includes(event)) {
			throw new Error(`Unallowed event called: ${event}`);
		}
		if (Object.hasOwn(this.listeners[event], listener)) {
			delete this.listeners[event][listener];
		}
	}

	clearListeners() {
		for (const event in this.listeners) {
			this.listeners[event] = {};
		}
	}
}

class ModloaderConfig {
	get(modName) {
		// TODO: Implement once decided on design
		return {};
	}
}

class ModloaderAPI {
	environmentType = undefined;
	events = undefined;
	config = undefined;

	constructor(environmentType) {
		logDebug(`Initializing modloader API for environment: ${environmentType}`);
		this.environmentType = environmentType;
		this.events = new ModloaderEvents(environmentType);
		this.config = new ModloaderConfig();
	}

	addPatch(source, file, patch) {
		if (this.environmentType !== "electron") {
			throw new Error("addPatch can only be called in the electron environment");
		}
		if (modsOrder.length === 0 || !Object.hasOwn(mods, source)) {
			throw new Error(`Mod not found: ${source}`);
		}
		gameFileManager.addPatch(file, patch);
	}

	repatchAll() {
		if (this.environmentType !== "electron") {
			throw new Error("addPatch can only be called in the electron environment");
		}
		gameFileManager.repatchAll();
	}

	repatch(file) {
		if (this.environmentType !== "electron") {
			throw new Error("addPatch can only be called in the electron environment");
		}
		gameFileManager.repatch(file);
	}

	clear() {
		this.events.clearListeners();
	}
}

// ------------ MAIN ------------

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

	reinitialize() {
		logDebug("Resetting game files to base...");

		// Do not need to reset if we are extracted and not modified
		if (this.isGameExtracted && !this.isGameModified) return;

		// Ensure we have a temp directory (if not already)
		this._createTempDirectory();

		// Ensure the game is extracted (if not already)
		this._extractFiles();

		// If the files are modified then reset them specific files
		if (this.isGameModified) this._resetFiles();

		// With the updated files now extract the games main.js electron app
		this._processGameAppMain();

		logDebug("Game files reset to base and initialized");
	}

	addPatch(file, patch) {
		logDebug(`Adding patch to file: ${file}`);
		if (!this.isGameExtracted) {
			throw new Error("Game files not extracted yet cannot add patch");
		}
		if (!this.fileData[file]) this._initializeFileData(file);
		this.fileData[file].patches.push(patch);
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

	cleanup() {
		logDebug("Cleaning up game files...");
		this._deleteTempDirectory();
		this.fileData = {};
		this.tempBasePath = undefined;
		this.tempExtractedPath = undefined;
		this.isTempInitialized = false;
		this.isGameExtracted = false;
		this.isGameModified = false;
	}

	static deleteOldTempDirectories() {
		logDebug("Finding and deleting all old temp directories...");
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
				throw new Error(`Error deleting old temp directory: ${e.stack}`);
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
		logInfo(`Extracting game.asar from ${this.gameAsarPath} to ${this.tempExtractedPath}`);
		try {
			asar.extractAll(this.gameAsarPath, this.tempExtractedPath);
		} catch (e) {
			throw new Error(`Error extracting game.asar: ${e.stack}`);
		}
		logDebug(`Successfully extracted game to ${this.tempExtractedPath}`);
		this.isGameExtracted = true;
		this.isGameModified = false;
	}

	_processGameAppMain() {
		if (!this.isGameExtracted) {
			throw new Error("Game files not extracted cannot process game app");
		}

		gameElectronFuncs = {};

		// Read the main.js file contents
		const mainPath = path.join(this.tempExtractedPath, "main.js");
		logInfo(`Processing game electron app: ${mainPath}`);
		let mainContent;
		try {
			mainContent = fs.readFileSync(mainPath, "utf8");
		} catch (e) {
			throw new Error(`Error reading main.js: ${e.stack}`);
		}

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

		const mainHash = stringToHash(mainContent);

		// Run the code to register their functions with eval
		// Using Function(...) doesn't work well due to not being able to access require or the global scope
		logDebug(`Executing eval(...) on modified game electron main.js with hash ${mainHash}`);
		try {
			gameElectronFuncs = {};
			eval(mainContent);
		} catch (e) {
			throw new Error(`Error evaluating game main.js: ${e.stack}`);
		}
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
			const asarPath = path.join(this.gameBasePath, file);
			logDebug(`Copying original file from asar: ${asarPath} to ${fullPath}`);
			fs.copyFileSync(asarPath, fullPath);
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
		logDebug(`Applying patches to file: ${fullPath}`);
		const patches = this.fileData[file].patches;
		let fileContent;
		try {
			fileContent = fs.readFileSync(fullPath, "utf8");
		} catch (e) {
			throw new Error(`Error reading file: ${fullPath}`);
		}

		for (const patch of patches) {
			fileContent = this._applyPatchToContent(fileContent, patch);
		}

		logDebug(`Writing patched content to file: ${fullPath}`);
		try {
			fs.writeFileSync(fullPath, fileContent, "utf8");
		} catch (e) {
			throw new Error(`Error writing patched content to file: ${fullPath}`);
		}

		this.fileData[file].isModified = true;
		this.isGameModified	= true;
	}

	_applyPatchToContent(fileContent, patch) {
		logDebug(`Applying patch: ${JSON.stringify(patch)}`);
		// TODO: Implement patching logic
		return fileContent;
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
		function updateConfigData(reference, target) {
			let modified = false;
			// If target doesn't have a property source has, then add it
			for (const key in reference) {
				if (typeof reference[key] === "object" && reference[key] !== null) {
					if (!Object.hasOwn(target, key)) {
						target[key] = {};
						modified = true;
					}
					updateConfigData(reference[key], target[key]);
				} else {
					if (!Object.hasOwn(target, key)) {
						target[key] = reference[key];
						modified = true;
					}
				}
			}
			// If target has a property source doesn't have, then remove it
			for (const key in target) {
				if (!Object.hasOwn(reference, key)) {
					delete target[key];
					modified = true;
				}
			}
			return modified;
		}

		const configContent = fs.readFileSync(configPath, "utf8");
		config = JSON.parse(configContent);
		let modified = updateConfigData(defaultConfig, config);

		if (!modified) {
			logDebug(`Config '${configPath}' is up-to-date`);
		} else {
			fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
			logDebug(`Config '${configPath}' updated successfully`);
		}
	}
}

function updateConfig() {
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
	logDebug(`Config '${configPath}' updated successfully`);
}

function initializeGameFiles() {
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

	logInfo(`Found game app.asar: ${asarPath}, extracting...`);

	// Now initialize the file manager with the base / asar path
	gameFileManager = new GameFileManager(fullGamePath, asarPath);
	gameFileManager.reinitialize();
}

function setModActive(modName, isActive) {
	logDebug(`Setting mod active: ${modname}.active = ${isActive}`);
	mod.isActive = isActive;
	modloaderAPI.events.triggerFor("ml:onSetActive", modName, isActive);
}

function loadModInfo(modPath) {
	// Try and read the modinfo.json
	logDebug(`Loading modinfo.json from: ${modPath}`);
	const modInfoPath = path.join(modPath, "modInfo.json");

	if (!fs.existsSync(modInfoPath)) {
		throw new Error(`modInfo.json not found: ${modInfoPath}`);
	}

	const modInfoContent = fs.readFileSync(modInfoPath, "utf8");
	const modInfo = JSON.parse(modInfoContent);

	// Ensure mod has required modinfo
	if (!modInfo || !modInfo.name || !modInfo.version || !modInfo.author) {
		throw new Error(`Invalid modInfo.json found: ${modInfoPath}`);
	}

	logDebug(`Loaded modinfo.json: ${modInfo.name}`);

	// If mod info defines entrypoints check they both exist
	if (modInfo.electronEntrypoint && !fs.existsSync(path.join(modPath, modInfo.electronEntrypoint))) {
		throw new Error(`Mod defines electron entrypoint ${modInfo.electronEntrypoint} but file not found: ${modPath}`);
	}

	if (modInfo.browserEntrypoint && !fs.existsSync(path.join(modPath, modInfo.browserEntrypoint))) {
		throw new Error(`Mod defines browser entrypoint ${modInfo.browserEntrypoint} but file none found: ${modPath}`);
	}

	return modInfo;
}

function unloadMod(modName) {
	if (!Object.hasOwn(mods, modName)) {
		throw new Error(`Mod not found: ${modName}`);
	}

	logDebug(`Unloading mod: ${modName}`);
	modloaderAPI.events.triggerFor("ml:onModUnloaded", modName);

	delete mods[modName];
	modsOrder = modsOrder.filter((m) => m !== modName);
}

function reloadAllMods() {
	logDebug("Reloading all mods...");

	// Unload all the current mods
	for (const modName in mods) {
		unloadMod(modName);
	}

	// Clear out the modloader API
	modloaderAPI.clear();
	mods = {};
	modsOrder = [];

	// Find all folders in the base mod folder and try load them as mods
	const baseModsPath = resolvePathRelativeToModloader(config.modsPath);
	logDebug(`Checking for mods in folder: ${baseModsPath}`);
	ensureDirectoryExists(baseModsPath);
	let modPaths = [];
	try {
		modPaths = fs.readdirSync(baseModsPath).map((p) => path.join(baseModsPath, p));
		modPaths = modPaths.filter((p) => fs.statSync(p).isDirectory());
	} catch (e) {
		throw new Error(`Error finding mods: ${e.stack}`);
	}
	logDebug(`Found ${modPaths.length} mod(s) in folder: ${baseModsPath}`);

	for (const modPath of modPaths) {
		// Try and load the mod, but continue with warning otherwise
		let modInfo;
		try {
			modInfo = loadModInfo(modPath);
		} catch (e) {
			logWarn(`Error loading mod at path ${modPath}: ${e.stack}`);
			continue;
		}

		// Ensure theres no mods with the same name
		if (Object.hasOwn(mods, modInfo.name)) {
			throw new Error(`Mod at path ${modPath} has the same name as another mod: ${modInfo.name}`);
		}

		// Officially save the mod into the load order
		const mod = { info: modInfo, path: modPath, isActive: true };
		mods[modInfo.name] = mod;
		modsOrder.push(modInfo.name);

		// Load the mods electron entrypoint then trigger the mod loaded event
		try {
			if (modInfo.electronEntrypoint) {
				const electronEntrypoint = path.join(mod.path, mod.info.electronEntrypoint);
				logDebug(`Loading electron entrypoint: ${electronEntrypoint}`);
				require(electronEntrypoint);
			}
		} catch (e) {
			throw new Error(`Error loading electron entrypoint for mod ${modInfo.name}: ${e.stack}`);
		}

		modloaderAPI.events.triggerFor("ml:onModLoaded", modInfo.name);
	}

	logInfo(`Loaded ${Object.keys(mods).length} mod(s) from ${baseModsPath}: [ ${modsOrder.join(", ")} ]`);
	modloaderAPI.events.trigger("ml:onAllModsLoaded");
}

function initializeModloader() {
	modloaderAPI = new ModloaderAPI("electron");
	reloadAllMods();
}

function getModData() {
	let modData = [];
	for (const modName of modsOrder) {
		modData.push({
			...mods[modName].info,
			isActive: mods[modName].isActive,
		});
	}
	return modData;
}

function reorderModsOrder(newModsOrder) {
	logDebug("Reordering mod load order...");

	if (newModsOrder.length !== modsOrder.length) {
		throw new Error(`Invalid new mod order length: ${newModsOrder.length} vs ${modsOrder.length}`);
	}

	for (const modName of newModsOrder) {
		if (!Object.hasOwn(mods, modName)) {
			throw new Error(`Invalid mod name in new order: ${modName}`);
		}
	}

	modsOrder = newModsOrder;
}

// ------------ ELECTRON  ------------

function setupModloaderIPC() {
	ipcMain.handle("ml:get-mods", async (event, args) => {
		logDebug("Received ml:get-mods");
		return getModData();
	});

	ipcMain.handle("ml:toggle-mod", async (event, args) => {
		logDebug("Received ml:toggle-mod");
		const modName = args.name;
		const isActive = args.active;
		setModActive(modName, isActive);
	});

	ipcMain.handle("ml:reload-mods", async (event, args) => {
		logDebug("Received ml:reload-mods");
		reloadAllMods();
	});

	ipcMain.handle("ml:start-game", async (event, args) => {
		logDebug("Received ml:start-game");
		startGameWindow();
	});
}

function startModloaderWindow() {
	try {
		logDebug("Starting modloader window: src/modloader/modloader.html");

		modloaderWindow = new BrowserWindow({
			width: 850,
			height: 500,
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
	logInfo("Starting game window...");
	gameFileManager.repatchAll();
	
}

function closeGameWindow() {
	gameWindow.close();
	gameWindow = null;

	// TODO: Handle game window closing
}

function onGameWindowClosed() {
	// TODO: Handle game window closing
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

	setupModloaderIPC();
}

function closeApp() {
	cleanupApp();
	app.quit();
}

function cleanupApp() {
	logDebug(`Unloading ${Object.keys(mods).length} mod(s)...`);

	for (const modName in mods) {
		modloaderAPI.events.triggerFor("ml:onModUnloaded", modName);
	}

	if (modloaderWindow) closeModloaderWindow();
	if (gameWindow) closeGameWindow();

	modloaderAPI.clear();
	gameFileManager.cleanup();

	logDebug("Cleanup complete");
}

function unexpectedCleanupApp() {
	// This is explicitly a different function on purpose
	// At this point we have caught an error and logged it already
	// It is possible we want to be more careful here
	try {
		cleanupApp();
	} catch (e) {
		logError(`Error during unexpected cleanup: ${e.stack}`);
	}
	logDebug("Unexpected cleanup complete");
}

async function startApp() {
	logInfo(`Starting modloader ${modloaderVersion}...`);

	catchUnexpectedExits();
	readAndLoadConfig();

	initializeGameFiles();
	initializeModloader();

	await setupApp();
	// startModloaderWindow();
	startGameWindow();
}

// ------------ MAIN ------------

(async () => {
	await startApp();
})();
