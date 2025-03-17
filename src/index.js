const { app, BrowserWindow } = require("electron");
const path = require("path");

app.whenReady().then(setupApp);

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		setupApp();
	}
});

function setupApp() {
	const win = new BrowserWindow({
		width: 800,
		height: 600,
		webPreferences: { nodeIntegration: true },
	});

	win.loadFile(path.join(__dirname, "index.html"));
}

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
