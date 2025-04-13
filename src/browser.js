import { EventBus } from "./common.js";

// ------------- VARIABLES -------------

globalThis.modloaderVersion = "2.0.0";
globalThis.modloaderAPI = undefined;

let loadedMods = [];

// ------------- UTILTY -------------

globalThis.log = function (level, tag, message) {
	const timestamp = new Date().toISOString().split("T")[1].split("Z")[0];
	const levelText = level.toUpperCase();
	let header = `[${tag ? tag + " " : ""}${levelText} ${timestamp}]`;
	console.log(`${header} ${message}`);
};

globalThis.closeFatal = function (tag, message) {
	log("fatal", tag, message);
	window.close();
};

const logDebug = (...args) => log("debug", "", args.join(" "));
const logInfo = (...args) => log("info", "", args.join(" "));
const logWarn = (...args) => log("warn", "", args.join(" "));
const logError = (...args) => log("error", "", args.join(" "));

// ------------- MAIN -------------

class BrowserModloaderAPI {
	static allEvents = ["ml:onMenuLoaded", "ml:onGameLoaded"];
	events = undefined;
	config = undefined;
	gameWorld = undefined;
	gameInstance = undefined;
	messageListeners = {};

	constructor() {
		this.events = new EventBus();
		this.config = new BrowserModConfigAPI();

		for (const event of BrowserModloaderAPI.allEvents) {
			this.events.registerEvent(event);
		}

		// ml-modloader:get-loaded-mods
		this.listenWorkerMessage("ml-modloader:get-loaded-mods", () => {
			this.sendWorkerMessage("ml-modloader:get-loaded-mods:response", loadedMods);
		});
	}

	async invokeElectronIPC(channel, ...args) {
		return await window.electron.invoke(`ml-mod:${channel}`, ...args);
	}

	async sendWorkerMessage(channel, ...args) {
		this.gameWorld.environment.multithreading.simulation.postAll(this.gameWorld, ["modloaderMessage", channel, ...args]);
	}

	async listenWorkerMessage(channel, handler) {
		if (this.messageListeners[channel]) throw new Error(`Message listener already exists for channel: ${channel}`);
		this.messageListeners[channel] = handler;
	}

	async _onWorkerMessage(channel, ...args) {
		if (!this.messageListeners[channel]) return null;
		this.messageListeners[channel](...args);
	}
}

class BrowserModConfigAPI {
	async get(modName) {
		return await window.electron.invoke("ml-config:get-config", modName);
	}

	async set(modName, config) {
		return await window.electron.invoke("ml-config:set-config", modName, config);
	}
}

async function loadAllMods() {
	loadedMods = (await window.electron.invoke("ml-modloader:get-load-order")).filter((mod) => mod.isLoaded);

	if (!loadedMods) {
		logError("No mods loaded");
		return;
	}

	for (const mod of loadedMods) {
		logDebug(`Loading mod '${mod.info.name}'`);

		if (!mod.info.browserEntrypoint) {
			logDebug(`Mod ${mod.info.name} does not have a browser entrypoint`);
			continue;
		}

		const entrypointPath = mod.path + "/" + mod.info.browserEntrypoint;
		await import(`file://${entrypointPath}`);
	}
}

globalThis.modloader_preloadBundle = async () => {
	// This is guaranteed to happen before the games bundle.js is loaded
	logInfo(`Starting browser modloader ${modloaderVersion}`);
	modloaderAPI = new BrowserModloaderAPI();
	await loadAllMods();
};

globalThis.modloader_onGameWorldInitialized = (s) => {
	// This is called just before the worker manager is initialized
	modloaderAPI.gameWorld = s;
	logInfo("Game world initialized");
};

globalThis.modloader_onGameInstanceInitialized = (s) => {
	modloaderAPI.gameInstance = s;
	const scene = modloaderAPI.gameInstance.state.store.scene.active;
	logInfo(`Game instance loaded with scene ${scene}`);
	modloaderAPI.events.trigger(scene == 1 ? "ml:onMenuLoaded" : "ml:onGameLoaded");
};

globalThis.modloader_onWorkerMessage = (m) => {
	m.data.shift();
	const channel = m.data.shift();
	modloaderAPI._onWorkerMessage(channel, ...m.data);
};
