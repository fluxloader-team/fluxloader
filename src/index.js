const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const process = require("process");

// ------------- GLOBALS -------------

globalThis.configPath = "modloader-config.json";
globalThis.config = undefined;

// ------------ MAIN ------------

function resolvePathRelativeToModloader(name) {
	return path.join(__dirname, name);
}

function processGameElectronApp() {
	console.log("Processing game electron");

	// Find the main.js inside the game.asar
	const asarPath = path.join(globalThis.config.gameDirectory, "resources", "app.asar");
	const mainPath = path.join(asarPath, "main.js");
	let mainContent = fs.readFileSync(mainPath, "utf8");

	// Rename and expose the games main electron functions
	mainContent = mainContent.replaceAll("function createWindow ()", "globalThis.gameElectron_createWindow = function()");
	mainContent = mainContent.replaceAll("function setupIpcHandlers()", "globalThis.gameElectron_setupIpcHandlers = function()");
	mainContent = mainContent.replaceAll("function loadSettingsSync()", "globalThis.gameElectron_loadSettingsSync = function()");
	mainContent = mainContent.replaceAll("loadSettingsSync()", "globalThis.gameElectron_loadSettingsSync()");

	// Block the automatic app listeners
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
	eval(mainContent);
}

function setupElectronApp() {
	console.log("Setting up electron app");

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

function readAndLoadConfig() {
	globalThis.configPath = resolvePathRelativeToModloader(globalThis.configPath);
	if (!fs.existsSync(globalThis.configPath)) throw new Error("Config file does not exist.");
	const configContent = fs.readFileSync(globalThis.configPath, "utf8");
	globalThis.config = JSON.parse(configContent);
}

function startGameWindow() {
	console.log("Starting game window");
	gameElectron_createWindow();
	gameElectron_setupIpcHandlers();
}

(async () => {
	readAndLoadConfig();
	processGameElectronApp();
	await app.whenReady();
	setupElectronApp();
	startGameWindow();
})();
