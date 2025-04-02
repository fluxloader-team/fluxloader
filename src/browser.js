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

class ModloaderBrowserAPI {
	events = undefined;
	config = undefined;

	constructor() {
		logDebug(`Initializing electron modloader API`);

		this.events = new EventBus();
		this.config = new ModloaderBrowserConfigAPI();

		for (const event of ["ml:onMenuLoaded", "ml:onGameLoaded"]) {
			this.events.registerEvent("modloader", event);
		}
	}

	async invokeElectronIPC(msg, ...args) {
		return await window.electron.invoke(msg, ...args);
	}

	async listenElectronIPC(msg, func) {
		return await window.electron.handle(msg, func);
	}

	_onGameWorldInitialized(s) {
		logInfo("Browser saw game world initialized");
		globalThis.gameWorld = s;
		// gameWorld.environment.multithreading.simulation.postAll(gameWorld, ["modloaderEvent", "hello world"])
	};
	
	_onWorkerMessage(m) {
		logDebug(`Browser received message from worker: ${JSON.stringify(m.data)}`);
	};
}

class ModloaderBrowserConfigAPI {
	async get(modName) {
		return await modloaderAPI.invokeElectronIPC("ml:get-config", modName);
	}

	async set(modName, config) {
		return await modloaderAPI.invokeElectronIPC("ml:set-config", modName, config);
	}
}

async function loadAllMods() {
	const mods = await modloaderAPI.invokeElectronIPC("ml:get-mods");
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
	logInfo(`Starting modloader browser ${modloaderVersion}...`);

	modloaderAPI = new ModloaderBrowserAPI();

	await loadAllMods();
})();
