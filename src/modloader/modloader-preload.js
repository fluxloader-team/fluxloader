const { contextBridge, ipcRenderer } = require("electron/renderer");

contextBridge.exposeInMainWorld("electronAPI", {
	message: async (msg, ...args) => await ipcRenderer.invoke(msg, ...args),
});
