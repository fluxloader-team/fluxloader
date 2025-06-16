// ------------- VARIABLES -------------

globalThis.fluxloaderVersion = "2.0.0";
globalThis.fluxloaderAPI = undefined;

// ------------- UTILTY -------------

globalThis.log = function (level, tag, message) {
	const timestamp = new Date().toISOString().split("T")[1].split("Z")[0];
	const levelText = level.toUpperCase();
	let header = `${levelText} ${timestamp}${tag ? ` ${tag}` : ""}`;
	console.log(`${header} ${message}`);
};

globalThis.logDebug = (...args) => log("debug", "", args.join(" "));
globalThis.logInfo = (...args) => log("info", "", args.join(" "));
globalThis.logWarn = (...args) => log("warn", "", args.join(" "));
globalThis.logError = (...args) => log("error", "", args.join(" "));

// ------------- MAIN -------------

class WorkerFluxloaderAPI {
	environment = "worker";
	workerWorld = undefined;
	messageListeners = {};

	async sendGameMessage(channel, ...args) {
		self.postMessage(["fluxloaderMessage", channel, ...args]);
	}

	listenGameMessage(channel, handler) {
		if (this.messageListeners[channel]) throw new Error(`Message listener already exists for channel: ${channel}`);
		this.messageListeners[channel] = handler;
	}

	async _onWorkerMessage(channel, ...args) {
		if (!this.messageListeners[channel]) return null;
		this.messageListeners[channel](...args);
	}
}

async function loadAllMods() {
	fluxloaderAPI.listenGameMessage("fl:get-loaded-mods:response", async (mods) => {
		for (const mod of mods) {
			if (!mod.info.workerEntrypoint) continue;
			const entrypointPath = mod.path + "/" + mod.info.workerEntrypoint;
			await import(`file://${entrypointPath}`);
		}
	});

	fluxloaderAPI.sendGameMessage("fl:get-loaded-mods");
}

globalThis.fluxloader_preloadBundle = async () => {
	// This is guaranteed to happen before the workers bundle.js is loaded
	fluxloaderAPI = new WorkerFluxloaderAPI();
};

globalThis.fluxloader_onWorkerInitialized = (workerWorld) => {
	// This is called after the workers Init event has been called
	// We have to wait otherwise the game-worker communication will not work
	fluxloaderAPI.workerWorld = workerWorld;
	if (workerWorld.environment.context === 2) {
		logInfo(`Worker fluxloader ${fluxloaderVersion} initialized, type=Worker, threadIndex=${workerWorld.environment.threadMeta.startingIndex}`);
	} else if (workerWorld.environment.context === 3) {
		logInfo(`Worker fluxloader ${fluxloaderVersion} initialized, type=Manager`);
	}
	loadAllMods();
};

globalThis.fluxloader_onWorkerMessage = (m) => {
	m.data.shift();
	const channel = m.data.shift();
	fluxloaderAPI._onWorkerMessage(channel, ...m.data);
};
