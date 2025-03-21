const { app, BrowserWindow, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const process = require("process");
const os = require("os");

// ------------- GLOBALS -------------

globalThis.modloaderVersion = "2.0.0";
globalThis.logLevels = ["debug", "info", "error"];
globalThis.defaultConfig = {
	gameDirectory: ".",
	modsFolder: "./mods",
	logging: {
		logToFile: true,
		logToConsole: true,
		consoleLogLevel: "debug",
		fileLogLevel: "debug",
		logFileName: "modloader.log",
	},
};
globalThis.configPath = "modloader-config.json";
globalThis.config = undefined;
globalThis.mods = [];

// ------------ UTILITY ------------

globalThis.log = function (level, tag, message) {
	if (!logLevels.includes(level)) {
		throw new Error(`Invalid log level: ${level}`);
	}

	const levelIndex = globalThis.logLevels.indexOf(level);
	const timestamp = new Date().toISOString().split("T")[1].split("Z")[0];
	const finalMessage = `[${level.toUpperCase()}${tag ? " (" + tag + ")" : ""} ${timestamp}] ${message}`;

	if (globalThis.config === undefined) {
		console.log(`${finalMessage} (warning: config not loaded)`);
	} else {
		if (globalThis.config.logging.logToFile) {
			const fileLogLevel = globalThis.logLevels.indexOf(globalThis.config.logging.fileLogLevel);
			if (levelIndex >= fileLogLevel) {
				const logPath = path.join(globalThis.config.gameDirectory, globalThis.config.logging.logFileName);
				fs.appendFileSync(logPath, finalMessage + "\n");
			}
		}

		if (globalThis.config.logging.logToConsole) {
			const consoleLevelIndex = globalThis.logLevels.indexOf(config.logging.consoleLogLevel);
			if (levelIndex >= consoleLevelIndex) {
				console.log(finalMessage);
			}
		}
	}

	return finalMessage;
};

globalThis.logDebug = (...args) => globalThis.log("debug", "", args.join(" "));
globalThis.logInfo = (...args) => globalThis.log("info", "", args.join(" "));
globalThis.logError = (...args) => new Error(globalThis.log("error", "", args.join(" ")));

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
	if (!globalThis.tempDirectory) {
		throw logError(`Temp directory doesn't exist: ${globalThis.tempDirectory}`);
	}

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

function readAndLoadConfig() {
	globalThis.configPath = resolvePathRelativeToModloader(globalThis.configPath);

	// If config file doesnt exist then create it with the defaults
	if (!fs.existsSync(globalThis.configPath)) {
		fs.writeFileSync(globalThis.configPath, JSON.stringify(defaultConfig, null, 4));
		globalThis.config = defaultConfig;
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
			logDebug(`Config file is up-to-date.`);
		} else {
			fs.writeFileSync(globalThis.configPath, JSON.stringify(config, null, 2), "utf8");
			logDebug(`Config '${globalThis.configPath}' updated successfully.`);
		}
	}
}

function updateConfig() {
	fs.writeFileSync(globalThis.configPath, JSON.stringify(globalThis.config, null, 2), "utf8");
	logDebug(`Config '${globalThis.configPath}' updated successfully.`);
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
		globalThis.gameAsarPath = path.join(globalThis.config.gameDirectory, "resources", "app.asar");
		logInfo(`Sandustry app.asar found: ${globalThis.config.gameDirectory}.`);
		return;
	}

	logDebug(`Sandustry app.asar not found: ${globalThis.config.gameDirectory}`);

	// Next we should check the default steam install location
	logDebug("checking default steam directory...");
	const steamPath = path.join(process.env["ProgramFiles(x86)"], "Steam", "steamapps", "common", "Sandustry Demo");
	if (checkDirectoryHasGameAsar(steamPath)) {
		globalThis.gameAsarPath = path.join(steamPath, "resources", "app.asar");
		logInfo(`Sandustry app.asar found inside steam path, updating config: ${steamPath}.`);
		globalThis.config.gameDirectory = steamPath;
		updateConfig();
		return;
	}

	throw logError(`Sandustry app.asar not found in configured path or default steam path: ${globalThis.config.gameDirectory} or ${steamPath}.`);
}

function validateMod(modExports) {
	// Ensure mod has required modinfo
	if (!modExports.modinfo || !modExports.modinfo.name || !modExports.modinfo.version) {
		throw logError(`Invalid mod info for mod: ${modExports.modinfo?.name || "unknown"}`);
	}
}

function reloadMods() {
	globalThis.mods = [];

	const baseModsPath = resolvePathRelativeToModloader(globalThis.config.modsFolder);
	ensureDirectoryExists(baseModsPath);

	// Find all possible mods in the mod folder
	let modPaths = [];
	try {
		logDebug(`Checking for mods in folder: ${baseModsPath}`);
		modPaths = fs.readdirSync(baseModsPath).filter((file) => file.endsWith(".js"));
	} catch (e) {
		throw logError(`Error loading mods: ${e}`);
	}

	for (const modPath of modPaths) {
		try {
			// Try and extract mod exports
			const modContent = fs.readFileSync(modPath, "utf8");
			const modFunction = new Function("exports", modContent);
			const modExports = {};
			modFunction(modExports);

			// Make sure mod exports anything
			if (!modExports) {
				throw logError(`Could not load mod: ${modPath}`);
			}

			// Make sure modinfo is correct
			validateMod(modExports);

			// Ensure theres no conflicting mods
			const conflict = globalThis.mods.find((otherMod) => otherMod.name == modExports.modinfo.name);
			if (conflict) {
				throw logError(`Mod conflict: ${conflict.path} with ${modPath} on name ${conflict.name}`);
			}

			// Add final extracted modinfo to the mod list
			globalThis.mods.push({
				name: modExports.modinfo.name,
				version: modExports.modinfo.version,
				exports: modExports,
				path: modPath,
				isActive: true,
			});
		} catch (e) {
			logError(`Error loading mod: ${modPath}`);
		}
	}

	log(`Loaded ${globalThis.mods.length} mod(s): [ ${globalThis.mods.map((m) => m.exports.modinfo.name).join(", ")} ]`);
}

async function setupElectronApp() {
	protocol.registerSchemesAsPrivileged([{ scheme: "file", privileges: { standard: true, supportFetchAPI: true, secure: true } }]);

	await app.whenReady();

	app.on("activate", () => {
		console("No windows open, starting modloader.");
		if (BrowserWindow.getAllWindows().length === 0) {
			setupApp();
		}
	});

	app.on("window-all-closed", () => {
		console.log("All windows closed, exiting");
		if (process.platform !== "darwin") {
			app.quit();
		}
	});
}

function processGameElectronApp() {
	// TODO: Refactor with new temp dir and logging

	console.log("Processing game electron");

	// Find the main.js inside the game.asar
	const asarPath = path.join(globalThis.config.gameDirectory, "resources", "app.asar");
	const mainPath = path.join(asarPath, "main.js");
	let mainContent = fs.readFileSync(mainPath, "utf8");

	// Rename and expose the games main electron functions
	mainContent = mainContent.replaceAll("function createWindow ()", "globalThis.sandustryElectron.createWindow = function()");
	mainContent = mainContent.replaceAll("function setupIpcHandlers()", "globalThis.sandustryElectron.setupIpcHandlers = function()");
	mainContent = mainContent.replaceAll("function loadSettingsSync()", "globalThis.sandustryElectron.loadSettingsSync = function()");
	mainContent = mainContent.replaceAll("loadSettingsSync()", "globalThis.sandustryElectron.loadSettingsSync()");

	// Block the automatic app listeners so we control when things happen
	mainContent = mainContent.replaceAll("app.whenReady().then(() => {", "var _ = (() => {");
	mainContent = mainContent.replaceAll("app.on('window-all-closed', function () {", "var _ = (() => {");

	// Ensure that the app thinks it is still running inside the app.asar
	// - Fix the userData path to be 'sandustrydemo' instead of 'mod-loader'
	// - Override relative "preload.js" to absolute
	// - Override relative "index.html" to absolute
	mainContent = mainContent.replaceAll('getPath("userData")', 'getPath("userData").replace("mod-loader", "sandustrydemo")');
	mainContent = mainContent.replaceAll("path.join(__dirname, 'preload.js')", `'${path.join(asarPath, "preload.js").replaceAll("\\", "/")}'`);
	mainContent = mainContent.replaceAll("loadFile('index.html')", `loadFile('${path.join(asarPath, "index.html").replaceAll("\\", "/")}')`);

	// Expose the games main window to be global
	mainContent = mainContent.replaceAll("const mainWindow", "globalThis.gameElectron_window");
	mainContent = mainContent.replaceAll("mainWindow", "globalThis.gameElectron_window");

	// Run the code to register their functions with eval
	// Using Function(...) doesn't work well due to not being able to access require or the global scope
	globalThis.sandustryElectron = {};
	eval(mainContent);
}

function extractAndApplyGamePatches() {
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

function startGameWindow() {
	// Create a new temp dir for the game
	const tempDir = createNewTempDirectory();
	const tempAsarPath = path.join(tempDir, "app.asar");
	const tempExtractPath = path.join(tempDir, "extracted");
	ensureDirectoryExists(tempExtractPath);

	// TODO: Set some global variables

	// Extract the game into the extracted path
	// TODO

	// Grab the initialization functions from the games electron main
	processGameElectronApp();

	// Apply the patches now we have extracted the game
	extractAndApplyGamePatches();

	// Finally we want to start the game window
}

(async () => {
	logInfo(`Starting modloader ${modloaderVersion}`);
	readAndLoadConfig();
	findAndVerifyGameExists();
	reloadMods();

	await setupElectronApp();

	deleteTempDirectory();
})();
