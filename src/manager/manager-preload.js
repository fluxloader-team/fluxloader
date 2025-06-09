const { contextBridge, ipcRenderer, shell } = require("electron");

contextBridge.exposeInMainWorld("api", {
	invoke: (msg, ...args) => ipcRenderer.invoke(msg, ...args),
	handle: (msg, func) => ipcRenderer.handle(msg, func),
	on: (msg, func) => ipcRenderer.on(msg, func)
});
