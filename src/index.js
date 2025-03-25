const { app, BrowserWindow, ipcMain } = require("electron");
globalThis.path = require("path");
globalThis.fs = require("fs");
globalThis.process = require("process");
globalThis.os = require("os");
globalThis.asar = require("asar");

// ------------- MOD DOCUMENTATION -------------

// Mods must export:
// - exports.modinfo = { name: string, version: string }

globalThis.requiredModInfo = ["name", "version"];

// Events that can be listened to through modloaderAPI.events.on(event, func)
// : Inside electron app environment
//   - ml:onModLoaded            When this mod is finished being loaded
//   - ml:onAllModsLoaded        When all mods are finished being loaded
//   - ml:onSetActive(isActive)  When mod set active / inactive
// : Inside game window environment
//   - ml:onMenuLoaded           When the game is loaded into the menu
//   - ml:onGameLoaded           When the game is loaded into the game

globalThis.allowedModEvents = ["onModLoaded", "onAllModsLoaded", "onMenuLoaded", "onGameLoaded", "onSetActive"];

// ------------- GLOBALS -------------

globalThis.modloaderVersion = "2.0.0";
globalThis.logLevels = ["debug", "info", "warn", "error"];
globalThis.logFilePath = undefined;
globalThis.preConfigLogLevel = "info";
globalThis.configPath = "modloader-config.json";
globalThis.config = undefined;
globalThis.tempDirectory = undefined;
globalThis.mods = [];
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
	const finalMessage = `[${level.toUpperCase().padEnd(6, " ")}${tag ? " (" + tag + ")" : ""} ${timestamp}] ${message}`;

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

class EventBus {
	events = [];
	listeners = {};

	registerEvent(event) {
		if (this.events.includes(event)) {
			throw new Error(`Event already registered: ${event}`);
		}

		this.events.push(event);
		this.listeners[event] = {};
	}

	trigger(event, ...args) {
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
		if (!this.events.includes(event)) {
			throw new Error(`Unallowed event called: ${event}`);
		}

		if (Object.hasOwn(this.listeners[event], listener)) {
			for (const func of this.listeners[event][listener]) {
				func(...args);
			}
		}
	}

	on(event, listener, func) {
		if (!this.events.includes(event)) {
			throw new Error(`Unallowed event called: ${event}`);
		}

		if (!Object.hasOwn(this.listeners[event], listener)) {
			this.listeners[event][listener] = [];
		}

		this.listeners[event][listener].push(func);
	}

	off(event, listener) {
		if (!this.events.includes(event)) {
			throw new Error(`Unallowed event called: ${event}`);
		}

		if (Object.hasOwn(this.listeners[event], listener)) {
			delete this.listeners[event][listener];
		}
	}
}

class ModloaderAPI {
	events = new EventBus();

	constructor() {
		for (const event of allowedModEvents) {
			this.events.registerEvent("ml:" + event);
		}
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

	let mod = mods.find((m) => m.name == modName);
	if (!mod) {
		throw new Error(`Mod not found: ${modName}`);
	}
	mod.isActive = isActive;

	modloaderAPI.events.triggerFor("onSetActive", modName, isActive);
}

function loadMod(modPath) {
	// Try and extract mod exports
	let modExports = {};
	try {
		const modContent = fs.readFileSync(modPath, "utf8");
		const modFunction = new Function("exports", modContent);
		modFunction(modExports);
	} catch (e) {
		logWarn(`Error loading mod ${modPath}: ${e.message}`);
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
	if (!modExports.modinfo || requiredModInfo.some((p) => !Object.hasOwn(modExports.modinfo, p))) {
		logWarn(`Invalid exports.modinfo for mod: ${modExports.modinfo?.name || "unknown"}`);
		return false;
	}
	logDebug(`Validated mod: ${modExports.modinfo.name}`);
	return true;
}

function reloadAllMods() {
	mods = [];

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

	for (const modPath of modPaths) {
		// Try load and validate each mod, continue with warning otherwise
		const modExports = loadMod(modPath);
		if (!modExports) continue;
		const isValid = validateMod(modExports);
		if (!isValid) continue;

		// Ensure theres no mods with the same name
		const conflict = mods.find((otherMod) => otherMod.name == modExports.modinfo.name);
		if (conflict) {
			throw new Error(`Mod conflict: ${conflict.path} with ${modPath} on name ${conflict.name}`);
		}

		const mod = { exports: modExports, path: modPath, isActive: true };
		modloaderAPI.events.triggerFor("ml:onModLoaded", mod.exports.name);
		mods.push(mod);
	}

	logInfo(`Loaded ${mods.length} mod(s) from ${baseModsPath}: [ ${mods.map((m) => m.exports.modinfo.name).join(", ")} ]`);

	for (const mod of mods) {
		modloaderAPI.events.trigger("ml:onAllModsLoaded");
	}
}

function getModData() {
	return mods.map((mod) => {
		return {
			...mod.exports.modinfo,
			isActive: mod.isActive,
		};
	});
}

function reorderModLoadOrder(modNameOrder) {
	logDebug("Reordering mod load order...");

	if (modNameOrder.length != mods.length) {
		logError(`New mod load order wrong length: ${modNameOrder.length} != ${mod.length}`);
	}

	// Grab each mod based on the name
	let modsNewOrder = [];

	// TODO

	mods = modsNewOrder;
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
	// TODO: Refactor to the new system and only consider active mods
	// if (modExports.api) {
	// 	Object.keys(modExports.api).forEach((key) => {
	// 		const list = modExports.api[key] instanceof Array ? modExports.api[key] : [modExports.api[key]];
	// 		if (key in intercepts) intercepts[key].push(...list);
	// 		else intercepts[key] = list;
	// 		log(`Mod "${modPath}" added ${list.length} rule(s) to API endpoint: ${key}`);
	// 	});
	// }
	// if (modExports.patches) {
	// 	bundlePatches = bundlePatches.concat(modExports.patches);
	// 	for (const patch of modExports.patches) {
	// 		log(`Mod "${modPath}" added patch: ${patch.type}`);
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

function startModloaderWindow() {
	try {
		logDebug("Starting modloader window: src/modloader/modloader.html");

		modloaderWindow = new BrowserWindow({
			width: 850,
			height: 500,
			webPreferences: {
				preload: resolvePathRelativeToModloader("modloader-preload.js"),
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
	extractGame();
	processGameAppMain();
	applyModPatches();
	// TODO

	logInfo("Starting game window...");
}

function closeGameWindow() {
	gameWindow.close();
	gameWindow = null;
}

function onGameWindowClosed() {
	// TODO
}

function closeApp() {
	cleanupApp();
	app.quit();
}

function cleanupApp() {
	deleteCurrentTempDirectory();
	if (modloaderWindow) closeModloaderWindow();
	if (gameWindow) closeGameWindow();
	logDebug("Cleanup complete");
}

function unexpectedCleanupApp() {
	// This is explicitly a different function on purpose
	// At this point we have caught an error and logged it already
	// It is possible we want to be more careful here
	try {
		deleteCurrentTempDirectory();
		if (modloaderWindow) closeModloaderWindow();
		if (gameWindow) closeGameWindow();
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
	modloaderAPI = new ModloaderAPI();
	readAndLoadConfig();
	findAndVerifyGameExists();
	reloadAllMods();

	// Start electron
	await setupApp();
	// startModloaderWindow();
	startGameWindow();
}

(async () => {
	await startApp();
})();
