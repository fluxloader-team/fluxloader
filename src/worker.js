// ------------- VARIABLES -------------

globalThis.modloaderVersion = "2.0.0";
globalThis.modloaderAPI = undefined;

// ------------- UTILTY -------------

globalThis.log = function (level, tag, message) {
	const timestamp = new Date().toISOString().split("T")[1].split("Z")[0];
	const levelText = level.toUpperCase();
	let header = `[${tag ? tag + " " : ""}${levelText} ${timestamp}]`;
	console.log(`${header} ${message}`);
};

globalThis.logDebug = (...args) => log("debug", "", args.join(" "));
globalThis.logInfo = (...args) => log("info", "", args.join(" "));
globalThis.logWarn = (...args) => log("warn", "", args.join(" "));
globalThis.logError = (...args) => log("error", "", args.join(" "));

// ------------- MAIN -------------

class WorkerModloaderAPI {
	workerWorld = undefined;
	messageListeners = {};

	async sendBrowserMessage(channel, ...args) {
		self.postMessage(["modloaderMessage", channel, ...args]);
	}

	listenBrowserMessage(channel, handler) {
		if (this.messageListeners[channel]) throw new Error(`Message listener already exists for channel: ${channel}`);
		this.messageListeners[channel] = handler;
	}

	async _onWorkerMessage(channel, ...args) {
		if (!this.messageListeners[channel]) return null;
		this.messageListeners[channel](...args);
	}
}

async function loadAllMods() {
	modloaderAPI.listenBrowserMessage("ml-modloader:get-loaded-mods:response", async (mods) => {
		for (const mod of mods) {
			if (!mod.info.workerEntrypoint) continue;
			const entrypointPath = mod.path + "/" + mod.info.workerEntrypoint;
			await import(`file://${entrypointPath}`);
		}
	});

	modloaderAPI.sendBrowserMessage("ml-modloader:get-loaded-mods");
}

globalThis.modloader_preloadBundle = async () => {
	// This is guaranteed to happen before the workers bundle.js is loaded
	logInfo(`Starting worker modloader ${modloaderVersion}`);
	modloaderAPI = new WorkerModloaderAPI();
};

globalThis.modloader_onWorkerInitialized = (workerWorld) => {
	// This is called after the workers Init event has been called
	// We have to wait otherwise the browser-worker communication will not work
	modloaderAPI.workerWorld = workerWorld;
	if (workerWorld.environment.context === 2) {
		logInfo(`Worker Init event complete, type=Worker, threadIndex=${workerWorld.environment.threadMeta.startingIndex}`);
	} else if (workerWorld.environment.context === 3) {
		logInfo(`Worker Init event complete, type=Manager`);
	}
	loadAllMods();
};

globalThis.modloader_onWorkerMessage = (m) => {
	m.data.shift();
	const channel = m.data.shift();
	modloaderAPI._onWorkerMessage(channel, ...m.data);
};
