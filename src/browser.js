import { EventBus } from "./common.js";

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

class BrowserModloaderAPI {
	events = undefined;
	config = undefined;
	gameWorld = undefined;
	gameInstance = undefined;

	constructor() {
		this.events = new EventBus();
		this.config = new BrowserModloaderConfigAPI();

		for (const event of ["ml:onMenuLoaded", "ml:onGameLoaded"]) {
			this.events.registerEvent("modloader", event);
		}
	}

	async sendMessage(destination, msg, ...args) {
		// TODO: Send this to the correct destination
		// gameWorld.environment.multithreading.simulation.postAll(gameWorld, ["modloaderEvent", "hello world"])
		return await window.electron.invoke(msg, ...args);
	}

	async receiveMessage(msg, func) {
		// TODO: Instead add to list of listeners and check the destination
		return await window.electron.handle(msg, func);
	}

	_onGameWorldInitialized(s) {
		logInfo("Browser saw game world initialized");
		this.gameWorld = s;
	};
	
	_onWorkerMessage(m) {
		logDebug(`Browser received message from worker: ${JSON.stringify(m.data)}`);
		// TODO: Handle forwarding the message to the correct destination
	};
}

class BrowserModloaderConfigAPI {
	async get(modName) {
		return await modloaderAPI.sendMessage("electron", "ml:get-config", modName);
	}

	async set(modName, config) {
		return await modloaderAPI.sendMessage("electron", "ml:set-config", modName, config);
	}
}

async function loadAllMods() {
	const mods = await modloaderAPI.sendMessage("electron", "ml:get-loaded-mods");
	logDebug(`Loading ${mods.length} mods...`);

	for (const mod of mods) {
		logDebug(`Loading mod ${mod.name}`);

		if (!mod.browserEntrypoint) {
			logDebug(`Mod ${mod.name} does not have a browser entrypoint`);
			continue;
		}

		const entrypointPath = mod.path + "/" + mod.browserEntrypoint;
		await import(`file://${entrypointPath}`);
	}
}

(async () => {
	logInfo(`Starting browser modloader ${modloaderVersion}...`);

	modloaderAPI = new BrowserModloaderAPI();

	await loadAllMods();
})();
