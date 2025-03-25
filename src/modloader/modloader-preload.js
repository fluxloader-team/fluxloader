const { contextBridge, ipcRenderer } = require("electron/renderer");

contextBridge.exposeInMainWorld("electronAPI", {
	getMods: () => ipcRenderer.invoke("ml:get-mods"),
	toggleMod: (modName, isActive) => ipcRenderer.invoke("ml:toggle-mod", modName, isActive),
	reloadMods: () => ipcRenderer.invoke("ml:reload-mods"),
	startGame: () => ipcRenderer.invoke("ml:start-game"),
});
