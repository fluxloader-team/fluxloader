const { contextBridge, ipcRenderer } = require("electron/renderer");

contextBridge.exposeInMainWorld("electron", {
	invoke: async (msg, ...args) => await ipcRenderer.invoke(msg, ...args),
	handle: async (msg, func) => await ipcRenderer.handle(msg, func)
});
