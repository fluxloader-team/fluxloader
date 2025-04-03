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
	async sendMessage(destination, msg, ...args) {
		// TODO: Implement
		return [];
	}

	async receiveMessage(msg, func) {
		// TODO: Implement
	}

	_onWorkerMessage(m) {
		logDebug(`Worker received message from browser: ${JSON.stringify(m.data)}`);
	};
}


async function loadAllMods() {
	modloaderAPI.receiveMessage("return:get-loaded-mods", async (mods) => {
		for (const mod of mods) {
			logDebug(`Loading mod ${mod.name}`);
	
			if (!mod.workerEntrpoint) {
				logDebug(`Mod ${mod.name} does not have a browser entrypoint`);
				continue;
			}
	
			const entrypointPath = mod.path + "/" + mod.workerEntrypoint;
			await import(`file://${entrypointPath}`);
		}
	});

	modloaderAPI.sendMessage("electron", "ml:get-loaded-mods");

}

(async () => {
	logInfo(`Starting worker modloader ${modloaderVersion}...`);

	modloaderAPI = new WorkerModloaderAPI();

	await loadAllMods();
})();
