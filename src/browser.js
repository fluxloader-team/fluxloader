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

	async sendMessage(msg, ...args) {
		return await window.electron.invoke(msg, ...args);
	}

	async listenMessage(msg, func) {
		return await window.electron.handle(msg, func);
	}
}

class ModloaderBrowserConfigAPI {
	async get(modName) {
		return await modloaderAPI.sendMessage("ml:get-config", modName);
	}

	async set(modName, config) {
		return await modloaderAPI.sendMessage("ml:set-config", modName, config);
	}
}

(async () => {
	logInfo(`Starting modloader ${modloaderVersion}...`);

	modloaderAPI = new ModloaderBrowserAPI();

	// TODO: Remove these debug lines
	const mods = await modloaderAPI.sendMessage("ml:get-mods");
	console.log(mods);
})();
