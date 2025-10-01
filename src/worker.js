// ------------- VARIABLES -------------

// -- CHANGE VERSION SEARCH : Search this to find where to change version
globalThis.fluxloaderVersion = "2.2.0";
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
	static allEvents = ["fl:worker-initialized"];
	environment = "worker";
	events = undefined;
	gameInstanceState = undefined;
	messageListeners = {};

	constructor() {
		this.events = new EventBus(false);
		for (const event of WorkerFluxloaderAPI.allEvents) {
			this.events.registerEvent(event);
		}
	}

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
	// Load all the worker entrypoints
	if (fluxloaderWorkerEntrypoints === undefined) {
		throw new Error("fluxloaderWorkerEntrypoints is undefined. Electron has failed to expose this to the workers.");
	}
	for (const workerEntrypoint of fluxloaderWorkerEntrypoints) {
		await import(`file://${workerEntrypoint}?${Date.now()}`);
	}
}

globalThis.fluxloaderPreloadBundle = async () => {
	// logInfo(`Preloading worker fluxloader ${fluxloaderVersion}...`);

	// Import modules here to block the worker before anything else
	const { EventBus } = await import(fluxloaderBasePath + "/common.js");
	globalThis.EventBus = EventBus;

	// Then immediately load the mods
	fluxloaderAPI = new WorkerFluxloaderAPI();
	await loadAllMods();
};

globalThis.fluxloaderOnWorkerInitialized = (gameInstanceState) => {
	// This is called after the workers Init event has been called
	// We have to wait otherwise the game-worker communication will not work
	fluxloaderAPI.gameInstanceState = gameInstanceState;
	if (gameInstanceState.environment.context === 2) {
		logInfo(`Worker fluxloader ${fluxloaderVersion} initialized, type=Worker, threadIndex=${gameInstanceState.environment.threadMeta.startingIndex}`);
	} else if (gameInstanceState.environment.context === 3) {
		logInfo(`Worker fluxloader ${fluxloaderVersion} initialized, type=Manager`);
	} else {
		logError(`Worker fluxloader ${fluxloaderVersion} initialized, type=Unknown, context=${gameInstanceState.environment.context}`);
	}

	fluxloaderAPI.events.trigger("fl:worker-initialized");
};

globalThis.fluxloaderOnWorkerMessage = (m) => {
	m.data.shift();
	const channel = m.data.shift();
	fluxloaderAPI._onWorkerMessage(channel, ...m.data);
};
