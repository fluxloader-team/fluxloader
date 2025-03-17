const fs = require("fs");

globalThis.gameAsarPath = "C:/Program Files (x86)/Steam/steamapps/common/Sandustry Demo/resources/app.asar";
globalThis.gameAsarMainPath = globalThis.gameAsarPath + "/main.js";
let mainContent = fs.readFileSync(globalThis.gameAsarMainPath, "utf8");

// We need to app.setName(...) as otherwise it will use "mod-loader"
// We need to app.setAppPath(...) as otherwise it will use __dirname for files
mainContent = mainContent.replaceAll(
	"app.whenReady().then(() => {",
	`app.setName("sandustrydemo");app.setAppPath('${globalThis.gameAsarPath}');app.whenReady().then(() => {`
);

// This is an explicit call to dirname so we redirect it to app.getAppPath(...)
mainContent = mainContent.replaceAll(
    "__dirname",
    "app.getAppPath()"
);

// Listen for when the game window is made
mainContent = mainContent.replaceAll(
    "mainWindow.loadFile('index.html')",
    "globalThis.onGameWindowCreated(mainWindow);mainWindow.loadFile('index.html')"
);

globalThis.onGameWindowCreated = function(gameWindow) {
    console.log("Game window created!");
    console.log(gameWindow);
}

eval(mainContent);
