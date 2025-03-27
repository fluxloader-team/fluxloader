const { app, BrowserWindow, ipcMain } = require("electron");
globalThis.path = require("path");
globalThis.fs = require("fs");
globalThis.process = require("process");
globalThis.os = require("os");
globalThis.asar = require("asar");

// NOTE: This file is work in progress as is this entire branch - at no specific commit does it reflect the final or current expected behaviour

// ------------- MOD DOCUMENTATION -------------

// (electron environment) Mods must define mod info:
// - exports.modinfo = { name: string, version: string }

globalThis.modInfoRequirements = ["name", "version"];

// (electron environment) Mods can add patches through modloaderAPI.addPatch(patch)
// patch: { file?: string, expectedMatches?: number, ... }
// - { ... type: "replace", from: string, to: string }
// - { ... type: "regex", match: string, replace: string }

globalThis.patchTypeRequirements = {
	replace: ["from", "to"],
	regex: ["match", "replace"],
};

// Events can be listened to with modloaderAPI.events.on(event, func)
//
// (electron environment)
//   - ml:onModLoaded             When this mod is loaded
//   - ml:onAllModsLoaded         When all mods are loaded
//   - ml:onSetActive(isActive)   When mod set active / inactive
//   - ml:onModUnloaded           When this mod is being unloaded (e.g. refresh)
//
// (browser environment)
//   - ml:onMenuLoaded   When the game is loaded into the menu
//   - ml:onGameLoaded   When the game is loaded into the game

globalThis.modEvents = ["ml:onModLoaded", "ml:onAllModsLoaded", "ml:onSetActive", "ml:onModUnloaded", "ml:onMenuLoaded", "ml:onGameLoaded"];

// ------------- GLOBALS -------------

globalThis.modloaderVersion = "2.0.0";
globalThis.logLevels = ["debug", "info", "warn", "error"];
globalThis.logFilePath = undefined;
globalThis.preConfigLogLevel = "info";
globalThis.configPath = "modloader-config.json";
globalThis.config = undefined;
globalThis.tempDirectory = undefined;
globalThis.mods = {};
globalThis.modsOrder = [];
globalThis.baseGameAsarPath = undefined;
globalThis.extractedAsarPath = undefined;
globalThis.extractedGamePath = undefined;
globalThis.gameElectronFuncs = undefined;
globalThis.gameWindow = undefined;
globalThis.modloaderWindow = undefined;
globalThis.modloaderAPI = undefined;
globalThis.defaultConfig = {
	gameDirectory: ".",
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

function createNewTempDirectory() {
	if (tempDirectory) {
		deleteCurrentTempDirectory();
	}

	const tempDir = path.join(os.tmpdir(), `sandustry-modloader-${Date.now()}`);
	logDebug(`Creating new temp directory: ${tempDir}`);
	ensureDirectoryExists(tempDir);
	tempDirectory = tempDir;
	return tempDir;
}

function deleteCurrentTempDirectory() {
	if (!tempDirectory) return;

	logDebug(`Deleting temp directory: ${tempDirectory}`);

	try {
		fs.rmSync(tempDirectory, { recursive: true });
	} catch (e) {
		throw new Error(`Failed to delete temp directory ${tempDirectory}: ${e.stack}`);
	}

	logDebug(`Temp directory deleted: ${tempDirectory}`);
	tempDirectory = undefined;
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

// TODO: This section probably needs to be moved to a separate file for browser / electron

class ModloaderEvents {
	events = [];
	listeners = {};

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
	events = new ModloaderEvents();
	config = new ModloaderConfig();

	constructor(environmentType) {
		this.environmentType = environmentType;
		for (const event of modEvents) {
			this.events.registerEvent(event);
		}
	}

	clear() {
		this.events.clearListeners();
	}

	addPatch(modName, patch) {
		// TODO: Implement once decided on design
	}

	performPatch(modName, patch) {
		// TODO: Implement once decided on design
	}
}

// ------------ MAIN ------------

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

function findAndVerifyGameExists() {
	function checkDirectoryHasGameAsar(dir) {
		if (!fs.existsSync(dir)) return false;
		const asarPath = path.join(dir, "resources", "app.asar");
		if (!fs.existsSync(asarPath)) return false;
		return true;
	}

	// If the game is where the config says then exit out
	if (checkDirectoryHasGameAsar(config.gameDirectory)) {
		baseGameAsarPath = path.join(config.gameDirectory, "resources", "app.asar");
		logInfo(`Sandustry app.asar found: ${config.gameDirectory}`);
		return;
	}

	logDebug(`Sandustry app.asar not found: ${config.gameDirectory}`);

	// Next we should check the default steam install location
	logDebug("checking default steam directory...");
	const steamPath = path.join(process.env["ProgramFiles(x86)"], "Steam", "steamapps", "common", "Sandustry Demo");
	if (checkDirectoryHasGameAsar(steamPath)) {
		baseGameAsarPath = path.join(steamPath, "resources", "app.asar");
		logInfo(`Sandustry app.asar found inside steam path, updating config: ${steamPath}`);
		config.gameDirectory = steamPath;
		updateConfig();
		return;
	}

	throw new Error(`Sandustry app.asar not found in configured path or default steam path: ${config.gameDirectory} or ${steamPath}`);
}

function setModActive(modName, isActive) {
	logDebug(`Setting mod active: ${modname}.active = ${isActive}`);

	// TODO

	mod.isActive = isActive;

	modloaderAPI.events.triggerFor("ml:onSetActive", modName, isActive);
}

function loadMod(modPath) {
	// Try and extract mod exports
	let modExports = {};
	try {
		modExports = require(modPath);
	} catch (e) {
		logWarn(`Error loading mod ${modPath}: ${e.stack}`);
		return null;
	}
	if (!modExports) {
		logWarn(`No mod exports found for mod: ${modPath}`);
		return null;
	}
	logDebug(`Loaded mod: ${modPath}`);
	return modExports;
}

function validateMod(modExports) {
	// Ensure mod has required modinfo
	if (!modExports.modinfo || modInfoRequirements.some((p) => !Object.hasOwn(modExports.modinfo, p))) {
		logWarn(`Invalid exports.modinfo for mod: ${modExports.modinfo?.name || "unknown"}`);
		return false;
	}
	logDebug(`Validated mod: ${modExports.modinfo.name}`);
	return true;
}

function reloadAllMods() {
	if (Object.keys(mods).length > 0) {
		logDebug(`Unloading ${Object.keys(mods).length} mod(s)...`);
		for (const modName in mods) {
			modloaderAPI.events.triggerFor("ml:onModUnloaded", modName);
		}
	}

	modloaderAPI.clear();
	mods = {};
	modsOrder = [];

	const baseModsPath = resolvePathRelativeToModloader(config.modsPath);
	logDebug(`Checking for mods in folder: ${baseModsPath}`);
	ensureDirectoryExists(baseModsPath);

	// Find all mod files in the mod folder
	let modPaths = [];
	try {
		modPaths = fs
			.readdirSync(baseModsPath)
			.filter((file) => file.endsWith(".js"))
			.map((file) => path.join(baseModsPath, file));
	} catch (e) {
		throw new Error(`Error loading mods: ${e.stack}`);
	}

	logDebug(`Found ${modPaths.length} mod(s) in folder: ${baseModsPath}`);

	// Try load and validate each mod, continue with warning otherwise
	for (const modPath of modPaths) {
		const modExports = loadMod(modPath);
		if (!modExports) continue;
		const isValid = validateMod(modExports);
		if (!isValid) continue;

		// Also ensure theres no mods with the same name
		const modName = modExports.modinfo.name;
		if (Object.hasOwn(mods, modName)) {
			throw new Error(`Mod at path ${modPath} has the same name as another mod: ${modName}`);
		}

		const mod = { exports: modExports, path: modPath, isActive: true };
		modloaderAPI.events.triggerFor("ml:onModLoaded", modName);
		mods[modName] = mod;
		modsOrder.push(modName);
	}

	logInfo(`Loaded ${Object.keys(mods).length} mod(s) from ${baseModsPath}: [ ${modsOrder.join(", ")} ]`);
	modloaderAPI.events.trigger("ml:onAllModsLoaded");
}

function getModData() {
	let modData = [];
	for (const modName of modsOrder) {
		modData.push({
			...mods[modName].exports.modinfo,
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

function extractGame() {
	const extractedBasePath = createNewTempDirectory();

	logInfo(`Extracting game.asar to ${extractedBasePath}`);

	extractedGamePath = path.join(extractedBasePath, "extracted");
	ensureDirectoryExists(extractedGamePath);

	if (!extractedAsarPath) {
		extractedAsarPath = path.join(extractedBasePath, "app.asar");
		logDebug(`Copying game.asar from ${baseGameAsarPath} to ${extractedAsarPath}`);
		try {
			if (!fs.existsSync(baseGameAsarPath)) {
				throw new Error(`Game.asar not found: ${baseGameAsarPath}`);
			}
			logDebug(`File exists at ${baseGameAsarPath}`);
			// This is needed otherwise the copy tries to do funky virtual .asar fs stuff
			process.noAsar = true;
			fs.copyFileSync(baseGameAsarPath, extractedAsarPath);
			process.noAsar = false;
		} catch (e) {
			throw new Error(`Error copying game.asar: ${e.stack}`);
		}
	}

	try {
		logDebug(`Extracting game.asar from ${extractedAsarPath} to ${extractedGamePath}`);
		asar.extractAll(extractedAsarPath, extractedGamePath);
	} catch (e) {
		throw new Error(`Error extracting game.asar: ${e.stack}`);
	}

	logDebug(`Successfully extracted game to ${extractedGamePath}`);
}

function processGameAppMain() {
	// Find the main.js inside the game.asar
	const basePath = extractedGamePath;
	const mainPath = path.join(basePath, "main.js");
	let mainContent;

	logInfo(`Processing game electron app: ${mainPath}`);

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
	mainContent = mainContent.replaceAll("path.join(__dirname, 'preload.js')", `'${path.join(basePath, "preload.js").replaceAll("\\", "/")}'`);
	mainContent = mainContent.replaceAll("loadFile('index.html')", `loadFile('${path.join(basePath, "index.html").replaceAll("\\", "/")}')`);

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

function applyModPatches() {
	logInfo(`Applying mod patches...`);

	// TODO: Implement once decided on design

	// for (const modName of modsOrder) {
	// 	const mod = mods[modName];
	// 	if (!mod.exports.patches) continue;

	// 	for (const patch of mod.exports.patches) {
	// 		const patchPath = path.join(extractedGamePath, patch.file || "bundle.js");
	// 		let patchContent;

	// 		try {
	// 			patchContent = fs.readFileSync(patchPath, "utf8");
	// 		} catch (e) {
	// 			throw new Error(`Error reading patch file ${patchPath}: ${e.stack}`);
	// 		}

	// 		if (patch.type == "replace") {
	// 			const expectedMatches = patch.expectedMatches || 1;
	// 			let matchCount = 0;
	// 			let startIndex = 0;
	// 			while (startIndex < patchContent.length) {
	// 				const index = patchContent.indexOf(patch.from, startIndex);
	// 				if (index === -1) break;
	// 				matchCount++;
	// 				startIndex = index + patch.from.length;
	// 			}
	// 			if (matchCount !== expectedMatches) {
	// 				throw new Error(`Patch failed: Expected ${expectedMatches} matches, but found ${matchCount} for patch in ${patchPath}`);
	// 			}
	// 			patchContent = patchContent.replaceAll(patch.from, patch.to);
	// 		} else if (patch.type == "regex") {
	// 			const expectedMatches = patch.expectedMatches || 1;
	// 			const regex = new RegExp(patch.match, "g");
	// 			const matches = patchContent.match(regex);
	// 			if (matches.length !== expectedMatches) {
	// 				throw new Error(`Patch failed: Expected ${expectedMatches} matches, but found ${matches.length} for patch in ${patchPath}`);
	// 			}
	// 			patchContent = patchContent.replace(regex, patch.replace);
	// 		}

	// 		try {
	// 			fs.writeFileSync(patchPath, patchContent, "utf8");
	// 		} catch (e) {
	// 			throw new Error(`Error writing patch file ${patchPath}: ${e.stack}`);
	// 		}
	// 	}
	// }
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
				preload: resolvePathRelativeToModloader("modloader/modloader-preload.js")
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
	// TODO: We may want a different control flow here
	// If the game has already been loaded once we prob dont want to extract again
	// Instead we want to revert the patches and reapply the new ones

	extractGame();
	processGameAppMain();
	applyModPatches();

	logInfo("Starting game window...");

	// TODO: Start game window
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

	deleteCurrentTempDirectory();
	logDebug("Cleanup complete");
}

function unexpectedCleanupApp() {
	// This is explicitly a different function on purpose
	// At this point we have caught an error and logged it already
	// It is possible we want to be more careful here
	try {
		for (const modName in mods) {
			modloaderAPI.events.triggerFor("ml:onModUnloaded", modName);
		}
		if (modloaderWindow) closeModloaderWindow();
		if (gameWindow) closeGameWindow();

		deleteCurrentTempDirectory();
	} catch (e) {
		logError(`Error during unexpected cleanup: ${e.stack}`);
	}
	logDebug("Unexpected cleanup complete");
}

// ------------ MAIN ------------

async function startApp() {
	logInfo(`Starting modloader ${modloaderVersion}...`);

	catchUnexpectedExits();

	// Start modloader
	modloaderAPI = new ModloaderAPI("electron");
	readAndLoadConfig();
	findAndVerifyGameExists();
	reloadAllMods();

	// Start electron
	await setupApp();
	startModloaderWindow();
	// startGameWindow();
}

(async () => {
	await startApp();
})();
