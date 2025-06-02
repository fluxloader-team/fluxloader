const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
	invoke: (msg, ...args) => ipcRenderer.invoke(msg, ...args),
	handle: (msg, func) => ipcRenderer.handle(msg, func),
	on: (msg, func) => ipcRenderer.on(msg, func),
});
