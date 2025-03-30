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
	async sendMessage(msg, ...args) {
		// logDebug(`Sending message ${msg} to main process`);
		// return await window.electron.invoke(msg, ...args);
		return [];
	}

	async listenMessage(msg, func) {
		// logDebug(`Listening message ${msg} from main process`);
		// return await window.electron.handle(msg, func);
	}
}

async function loadAllMods() {
	const mods = await modloaderAPI.sendMessage("ml:get-mods");
	// logDebug(`Loading ${mods.length} mods...`);

	for (const mod of mods) {
		logDebug(`Loading mod ${mod.name}`);

		if (!mod.workerEntrpoint) {
			logDebug(`Mod ${mod.name} does not have a browser entrypoint`);
			continue;
		}

		const entrypointPath = mod.path + "/" + mod.workerEntrypoint;
		await import(`file://${entrypointPath}`);
	}
}

(async () => {
	logInfo(`Starting modloader worker ${modloaderVersion}...`);

	modloaderAPI = new ModloaderBrowserAPI();

	await loadAllMods();
})();
