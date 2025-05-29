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
	static allEvents = ["ml:onMenuLoaded", "ml:onGameLoaded", "ml:onPageRedirect"];
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
	loadedMods = await window.electron.invoke("ml-modloader:get-loaded-mods");

	if (!loadedMods) {
		logError("No mods loaded");
		return;
	}

	logDebug(`Loading ${loadedMods.length} mods...`);

	for (const mod of loadedMods) {
		if (!mod.info.browserEntrypoint) continue;
		logDebug(`Loading mod '${mod.info.name}'`);
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

globalThis.modloader_onPageRedirect = async (path) => {
	modloaderAPI.events.trigger("ml:onPageRedirect", path);
	await window.electron.invoke("ml-modloader:trigger-page-redirect", path);
};

// Should definitely be changed to load from an image in the future
globalThis.setupModdedSubtitle = function (spawnSolid, imagePath) {
	let title = [];
	let interval;

	// Allow jumping across gaps to designated coordinates
	let jumpFrom = {};
	let jumpTo = {};
	let jumps = {};

	const img = new Image();
	let canvas = document.createElement("canvas");
	let ctx = canvas.getContext("2d");
	img.src = imagePath;

	img.onload = () => {
		canvas.width = img.width;
		canvas.height = img.height;
		ctx.drawImage(img, 0, 0);

		const imageData = ctx.getImageData(0, 0, img.width, img.height);
		let pixels = imageData.data;
		for (let y = 0; y < img.height; y++) {
			title[y] = [];
			for (let x = 0; x < img.width; x++) {
				let index = 4 * (x + y * img.width); // 4 accounts for the RGBA
				let pixel = pixels.slice(index, index + 4);
				title[y][x] = pixel[3] > 0 ? 1 : 0;
				// Uses Red/Green channel for jumping To/From respectively
				if (pixel[0] > 0) {
					jumpFrom[pixel[0]] = { x, y };
				}
				if (pixel[1] > 0) {
					jumpTo[pixel[1]] = { x, y };
				}
			}
		}

		// Restructure jumps
		for (let [channel, from] of Object.entries(jumpFrom)) {
			// Check if a `jumpTo` location exists on the same channel
			if (jumpTo.hasOwnProperty(channel)) {
				jumps[`${from.x}, ${from.y}`] = jumpTo[channel];
			} else {
				throw new Error(`Could not find valid jumpTo location for channel ${channel} at {${from.x}, ${from.y}}`);
			}
		}

		interval = setInterval(loop, 60);
	};

	document.body.appendChild(canvas);

	function loop() {
		if (globalThis.moddedSubtitleActivePositions && globalThis.moddedSubtitleActivePositions.length == 0) return clearInterval(interval);

		function tryGet(x, y) {
			if (x < 0 || y < 0 || y >= title.length || x >= title[y].length) return false;
			return title[y][x];
		}

		const origin = {
			x: 392 + 80,
			y: 404 + 32,
		};

		const particle = 14; // Fluxite
		if (!globalThis.moddedSubtitleActivePositions || !globalThis.moddedSubtitleInvalidPositions) {
			globalThis.moddedSubtitleActivePositions = [
				{
					x: 0,
					y: 0,
				},
			];
			globalThis.moddedSubtitleInvalidPositions = [];
		}

		const offsets = [
			[-1, 0],
			[0, 1],
			[1, 0],
			[0, -1],
		];

		for (const position of [...globalThis.moddedSubtitleActivePositions]) {
			spawnSolid(modloaderAPI.gameInstance.state, origin.x + position.x, origin.y + position.y, particle);

			const posName = `${position.x}, ${position.y}`;
			const mappedNames = globalThis.moddedSubtitleActivePositions.map((pos) => `${pos.x}, ${pos.y}`);
			globalThis.moddedSubtitleInvalidPositions.push(posName);
			globalThis.moddedSubtitleActivePositions.splice(mappedNames.indexOf(posName), 1);

			if (jumps[posName]) {
				globalThis.moddedSubtitleActivePositions.push(jumps[posName]);
			}

			for (const offset of offsets) {
				const newPos = { x: position.x + offset[0], y: position.y + offset[1] };
				const newPosName = `${newPos.x}, ${newPos.y}`;
				const mappedNames = globalThis.moddedSubtitleActivePositions.map((pos) => `${pos.x}, ${pos.y}`);

				// Will return truthy if particle should be placed, falsey if not
				if (tryGet(newPos.x, newPos.y) && !globalThis.moddedSubtitleInvalidPositions.includes(newPosName) && !mappedNames.includes(newPosName)) {
					globalThis.moddedSubtitleActivePositions.push(newPos);
				}
			}
		}
	}
};
