const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const process = require("process");

// ------------- UTILITY -------------

function resolvePathRelativeToModloader(name) {
	return path.join(__dirname, name);
}

// ------------- MAIN -------------

function readAndLoadConfig() {
	globalThis.configPath = resolvePathRelativeToModloader("modloader-config.json");
	if (!fs.existsSync(globalThis.configPath)) {
		globalThis.config = {};
		return;
	}
	globalThis.config = JSON.parse(fs.readFileSync(globalThis.configPath, "utf8"));
}

function setupModloaderWindow() {
	console.log("Setting up Modloader window...");
	const win = new BrowserWindow({
		width: 800,
		height: 600,
		webPreferences: { nodeIntegration: true },
	});
	win.loadFile(path.join(__dirname, "index.html"));
}

function setupGameWindow() {
    // TODO
}

async function setupApp() {
	console.log("Setting up Electron...");
	readAndLoadConfig();
	setupGameWindow();
}

// ------------- DRIVER CODE -------------

app.on("activate", () => {
	console("No windows open, starting modloader.");
	if (BrowserWindow.getAllWindows().length === 0) {
		setupApp();
	}
});

app.on("window-all-closed", () => {
	console.log("All windows closed, exiting...");
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.whenReady().then(() => {
	setupApp();
});
