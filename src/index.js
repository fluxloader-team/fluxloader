const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const process = require("process");
const os = require("os");

// ------------- GLOBALS -------------

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

globalThis.modloaderVersion = "2.0.0";
globalThis.logLevels = ["debug", "info", "warn", "error"];
globalThis.logFilePath = undefined;
globalThis.preConfigLogLevel = "info";
globalThis.configPath = "modloader-config.json";
globalThis.config = undefined;
globalThis.tempDirectory = undefined;
globalThis.mods = [];
globalThis.baseGameAsarPath = undefined;
globalThis.extractedGamePath = undefined;
globalThis.gameElectronFuncs = undefined;
globalThis.gameWindow = undefined;
globalThis.modloaderWindow = undefined;

// ------------ UTILTY ------------

globalThis.log = function (level, tag, message) {
	if (!logLevels.includes(level)) {
		throw new Error(`Invalid log level: ${level}`);
	}

	const levelIndex = globalThis.logLevels.indexOf(level);
	const timestamp = new Date().toISOString().split("T")[1].split("Z")[0];
	const finalMessage = `[${level.toUpperCase().padEnd(6, " ")}${tag ? " (" + tag + ")" : ""} ${timestamp}] ${message}`;

	// Only log to file if defined by the config and level is allowed
	if (globalThis.config && globalThis.config.logging.logToFile) {
		const fileLogLevel = globalThis.logLevels.indexOf(globalThis.config.logging.fileLogLevel);
		if (levelIndex >= fileLogLevel) {

			// Setup the global log file path the first time we need it
			if (!globalThis.logFilePath) {
				globalThis.logFilePath = resolvePathRelativeToModloader(globalThis.config.logging.logFilePath);
				try {
					fs.appendFileSync(globalThis.logFilePath, new Date().toISOString() + "\n");
				} catch (e) {
					throw logError(`Error writing to log file: ${e}`);
				}
				logDebug(`Log file path set to: ${globalThis.logFilePath}`);
			}

			fs.appendFileSync(globalThis.logFilePath, finalMessage + "\n");
		}
	}

	// If config is not loaded then use the pre-config log level and always log to console
	// Otherwise only log to console if defined by the config and level is allowed
	let consoleLevel = preConfigLogLevel;
	if (globalThis.config) consoleLevel = globalThis.config.logging.consoleLogLevel;
	if (!globalThis.config || globalThis.config.logging.logToConsole) {
		const consoleLevelIndex = globalThis.logLevels.indexOf(consoleLevel);
		if (levelIndex >= consoleLevelIndex) {
			console.log(finalMessage);
		}
	}

	return finalMessage;
};

globalThis.logDebug = (...args) => globalThis.log("debug", "", args.join(" "));
globalThis.logInfo = (...args) => globalThis.log("info", "", args.join(" "));
globalThis.logWarn = (...args) => globalThis.log("warn", "", args.join(" "));
globalThis.logError = (...args) => {
	const message = args.join(" ");
	globalThis.log("error", "", message);
	return new Error(message);
};

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
	if (globalThis.tempDirectory) {
		deleteTempDirectory();
	}

	const tempDir = path.join(os.tmpdir(), `modloader-${Date.now()}`);
	logDebug(`Creating new temp directory: ${tempDir}`);
	ensureDirectoryExists(tempDir);
	globalThis.tempDirectory = tempDir;
	return tempDir;
}

function deleteTempDirectory() {
	if (!globalThis.tempDirectory) return;

	logDebug(`Deleting temp directory: ${globalThis.tempDirectory}`);

	try {
		fs.rmSync(globalThis.tempDirectory, { recursive: true });
	} catch (e) {
		throw logError(`Failed to delete temp directory: ${globalThis.tempDirectory}`);
	}

	logDebug(`Temp directory deleted: ${globalThis.tempDirectory}`);
	globalThis.tempDirectory = undefined;
}

// ------------ MAIN ------------

function listenToUnhandledErrors() {
	process.on("uncaughtException", (err) => {
		logError(`Uncaught exception: ${err}`);
		process.exit(1);
	});

	process.on("unhandledRejection", (err) => {
		logError(`Unhandled rejection: ${err}`);
		process.exit(1);
	});
}

function readAndLoadConfig() {
	globalThis.configPath = resolvePathRelativeToModloader(globalThis.configPath);
	logDebug(`Reading config from: ${globalThis.configPath}`);

	// If config file doesnt exist then create it with the defaults
	if (!fs.existsSync(globalThis.configPath)) {
		fs.writeFileSync(globalThis.configPath, JSON.stringify(defaultConfig, null, 4));
		globalThis.config = defaultConfig;
		logDebug(`No config found at '${globalThis.configPath}', set to default`);
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

		const configContent = fs.readFileSync(globalThis.configPath, "utf8");
		globalThis.config = JSON.parse(configContent);
		let modified = updateConfigData(defaultConfig, globalThis.config);

		if (!modified) {
			logDebug(`Config '${globalThis.configPath}' is up-to-date`);
		} else {
			fs.writeFileSync(globalThis.configPath, JSON.stringify(config, null, 2), "utf8");
			logDebug(`Config '${globalThis.configPath}' updated successfully`);
		}
	}
}

function updateConfig() {
	fs.writeFileSync(globalThis.configPath, JSON.stringify(globalThis.config, null, 2), "utf8");
	logDebug(`Config '${globalThis.configPath}' updated successfully`);
}

function findAndVerifyGameExists() {
	function checkDirectoryHasGameAsar(dir) {
		if (!fs.existsSync(dir)) return false;
		const asarPath = path.join(dir, "resources", "app.asar");
		if (!fs.existsSync(asarPath)) return false;
		return true;
	}

	// If the game is where the config says then exit out
	if (checkDirectoryHasGameAsar(globalThis.config.gameDirectory)) {
		globalThis.baseGameAsarPath = path.join(globalThis.config.gameDirectory, "resources", "app.asar");
		logInfo(`Sandustry app.asar found: ${globalThis.config.gameDirectory}`);
		return;
	}

	logDebug(`Sandustry app.asar not found: ${globalThis.config.gameDirectory}`);

	// Next we should check the default steam install location
	logDebug("checking default steam directory...");
	const steamPath = path.join(process.env["ProgramFiles(x86)"], "Steam", "steamapps", "common", "Sandustry Demo");
	if (checkDirectoryHasGameAsar(steamPath)) {
		globalThis.baseGameAsarPath = path.join(steamPath, "resources", "app.asar");
		logInfo(`Sandustry app.asar found inside steam path, updating config: ${steamPath}`);
		globalThis.config.gameDirectory = steamPath;
		updateConfig();
		return;
	}

	throw logError(`Sandustry app.asar not found in configured path or default steam path: ${globalThis.config.gameDirectory} or ${steamPath}`);
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
	if (!modExports.modinfo || !modExports.modinfo.name || !modExports.modinfo.version) {
		logWarn(`Invalid exports.modinfo for mod: ${modExports.modinfo?.name || "unknown"}`);
		return false;
	}
	logDebug(`Validated mod: ${modExports.modinfo.name}`);
	return true;
}

function reloadMods() {
	globalThis.mods = [];

	const baseModsPath = resolvePathRelativeToModloader(globalThis.config.modsPath);
	logDebug(`Checking for mods in folder: ${baseModsPath}`);
	ensureDirectoryExists(baseModsPath);

	// Find all mod files in the mod folder
	let modPaths = [];
	try {
		modPaths = fs.readdirSync(baseModsPath)
			.filter((file) => file.endsWith(".js"))
			.map((file) => path.join(baseModsPath, file));
	} catch (e) {
		throw logError(`Error loading mods: ${e}`);
	}

	logDebug(`Found ${modPaths.length} mod(s) in folder: ${baseModsPath}`);

	for (const modPath of modPaths) {
		// Try load and validate each mod, continue with warning otherwise
		const modExports = loadMod(modPath);
		if (!modExports) continue;
		const isValid = validateMod(modExports);
		if (!isValid) continue;

		// Ensure theres no mods with the same name
		const conflict = globalThis.mods.find((otherMod) => otherMod.name == modExports.modinfo.name);
		if (conflict) {
			throw logError(`Mod conflict: ${conflict.path} with ${modPath} on name ${conflict.name}`);
		}

		globalThis.mods.push({
			exports: modExports,
			path: modPath,
			isActive: true,
		});
	}

	logInfo(`Loaded ${globalThis.mods.length} mod(s) from ${baseModsPath}: [ ${globalThis.mods.map((m) => m.exports.modinfo.name).join(", ")} ]`);
}

function getModData() {
	return globalThis.mods.map((mod) => {
		return {
			...mod.exports.modinfo,
			isActive: mod.isActive,
		};
	});
}

function setModActive(modName, isActive) {
	logDebug(`Setting mod active: ${modname}.active = ${isActive}`);

	let mod = globalThis.mods.find((m) => m.name == modName);
	if (!mod) {
		throw logError(`Mod not found: ${modName}`);
	}
	mod.isActive = isActive;
}

function reorderModLoadOrder(modNameOrder) {
	logDebug("Reordering mod load order...");

	if (modNameOrder.length != globalThis.mods.length) {
		logError(`New mod load order wrong length: ${modNameOrder.length} != ${globalThis.mod.length}`);
	}

	// Grab each mod based on the name
	let modsNewOrder = [];
	
	// TODO

	globalThis.mods = modsNewOrder;
}

function extractGame() {
	// Create a new temp dir for the game
	const extractedBasePath = createNewTempDirectory();
	const extractedAsarPath = path.join(tempDir, "app.asar");
	globalThis.extractedGamePath = path.join(tempDir, "extracted");
	ensureDirectoryExists(globalThis.extractedGamePath);
	
	logDebug(`Extracting game.asar to ${extractedBasePath}`);

	// TODO
}

function applyModPatches() {
	// TODO: Refactor to the new system and only consider active mods
	// if (modExports.api) {
	// 	Object.keys(modExports.api).forEach((key) => {
	// 		const list = modExports.api[key] instanceof Array ? modExports.api[key] : [modExports.api[key]];
	// 		if (key in globalThis.intercepts) globalThis.intercepts[key].push(...list);
	// 		else globalThis.intercepts[key] = list;
	// 		log(`Mod "${modPath}" added ${list.length} rule(s) to API endpoint: ${key}`);
	// 	});
	// }
	// if (modExports.patches) {
	// 	globalThis.bundlePatches = globalThis.bundlePatches.concat(modExports.patches);
	// 	for (const patch of modExports.patches) {
	// 		log(`Mod "${modPath}" added patch: ${patch.type}`);
	// 	}
	// }
}

function processGameApp() {
	// Find the main.js inside the game.asar
	const basePath = globalThis.extractedGamePath;
	const mainPath = path.join(asarPath, "main.js");
	let mainContent;

	logDebug(`Processing game electron app: ${mainPath}`);
	try {
		mainContent = fs.readFileSync(mainPath, "utf8");
	} catch (e) {
		throw logError(`Error reading main.js: ${e}`);
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

	// Run the code to register their functions with eval
	// Using Function(...) doesn't work well due to not being able to access require or the global scope
	logDebug(`Evaluating game electron app of length ${mainContent.length}`);
	try {
		globalThis.gameElectronFuncs = {};
		eval(mainContent);
	} catch (e) {
		throw logError(`Error evaluating main.js: ${e}`);
	}
}

// ------------ ELECTRON  ------------

function setupModloaderIPC() {
	ipcMain.handle("ml:get-mods", async (event, args) => {
		return getModData();
	});

	ipcMain.handle("ml:toggle-mod", async (event, args) => {
		const modName = args.name;
		const isActive = args.active;
		setModActive(modName, isActive);
	});
	
	ipcMain.handle("ml:reload-mods", async (event, args) => {
		reloadMods();
	});

	ipcMain.handle("ml:start-game", async (event, args) => {
		startGameWindow();
	});
}

async function setupApp() {
	process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";

	await app.whenReady();

	app.on("window-all-closed", () => {
		logInfo("All windows closed, exiting...");
		if (process.platform !== "darwin") {
			cleanupApp();
			app.quit();
		}
	});

	setupModloaderIPC();
}

function startModloaderWindow() {
	try {
		logDebug("Starting modloader window: src/modloader.html");

		globalThis.modloaderWindow = new BrowserWindow({
			width: 1400,
			height: 1200,
			webPreferences: {
				preload: resolvePathRelativeToModloader("modloader-preload.js")
			},
		});

		globalThis.modloaderWindow.on("closed", () => {
			globalThis.modloaderWindow = null;
		});
		
		globalThis.modloaderWindow.loadFile("src/modloader.html");
		globalThis.modloaderWindow.webContents.openDevTools();

	} catch (e) {
		throw logError(`Error starting modloader window: ${e}`);
	}
}

function startGameWindow() {
	extractGame();
	processGameApp();
	applyModPatches();
	// TODO
}

function closeGameWindow() {
	// TODO
}

function cleanupApp() {
	deleteTempDirectory();
	logDebug("Cleanup complete");
	console.log("\n");
}

(async () => {
	logInfo(`Starting modloader ${modloaderVersion}...`);

	listenToUnhandledErrors();
	readAndLoadConfig();
	findAndVerifyGameExists();
	reloadMods();

	await setupApp();
	startModloaderWindow();
})();
