import { EventBus, Logging } from "./common.js";

// ------------- VARIABLES -------------

globalThis.fluxloaderVersion = "2.0.0";
globalThis.fluxloaderAPI = undefined;

let loadedMods = [];

// ------------- LOGGING -------------

globalThis.log = function (level, tag, message) {
	const timestamp = new Date();
	console.log(`${Logging.logHead(timestamp, level, tag)} ${message}`);
	forwardLogToManager({ source: "game", timestamp, level, tag, message });
};

const logDebug = (...args) => log("debug", "", args.join(" "));
const logInfo = (...args) => log("info", "", args.join(" "));
const logWarn = (...args) => log("warn", "", args.join(" "));
const logError = (...args) => log("error", "", args.join(" "));

function forwardLogToManager(log) {
	window.electron.invoke("fl:forward-log-to-manager", log);
}

// ------------- MAIN -------------

class GameFluxloaderAPI {
	static allEvents = ["fl:menu-loaded", "fl:game-loaded"];
	environment = "game";
	events = undefined;
	modConfig = undefined;
	gameWorld = undefined;
	gameInstance = undefined;
	messageListeners = {};

	constructor() {
		this.events = new EventBus();
		this.modConfig = new GameModConfigAPI();

		for (const event of GameFluxloaderAPI.allEvents) {
			this.events.registerEvent(event);
		}

		// fl:get-loaded-mods
		this.listenWorkerMessage("fl:get-loaded-mods", () => {
			this.sendWorkerMessage("fl:get-loaded-mods:response", loadedMods);
		});
	}

	async invokeElectronIPC(channel, ...args) {
		return await window.electron.invoke(`fl-mod:${channel}`, ...args);
	}

	async sendWorkerMessage(channel, ...args) {
		this.gameWorld.environment.multithreading.simulation.postAll(this.gameWorld, ["fluxloaderMessage", channel, ...args]);
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

class GameModConfigAPI {
	async get(modName) {
		return await window.electron.invoke("fl-mod-config:get", modName);
	}

	async set(modName, config) {
		return await window.electron.invoke("fl-mod-config:set", modName, config);
	}
}

async function loadAllMods() {
	loadedMods = await window.electron.invoke("fl:get-loaded-mods");

	if (!loadedMods) {
		logError("No mods loaded");
		return;
	}

	logDebug(`Loading ${loadedMods.length} mods...`);

	for (const mod of loadedMods) {
		if (!mod.info.gameEntrypoint) continue;
		logDebug(`Loading mod '${mod.info.name}'`);
		const entrypointPath = mod.path + "/" + mod.info.gameEntrypoint;
		await import(`file://${entrypointPath}`);
	}
}

function catchUnexpectedExits() {
	window.onerror = (event) => {
		logError(`An unexpected error occurred: ${JSON.stringify(event)}`);
	};
	window.onunhandledrejection = (event) => {
		logError(`An unhandled promise rejection occurred: ${JSON.stringify(event)}`);
	};
}

globalThis.fluxloader_preloadBundle = async () => {
	// This is guaranteed to happen before the games bundle.js is loaded
	logInfo(`Starting Game Sandustry Fluxloader ${fluxloaderVersion}`);
	fluxloaderAPI = new GameFluxloaderAPI();
	catchUnexpectedExits();
	await loadAllMods();
};

globalThis.fluxloader_onGameWorldInitialized = (s) => {
	// This is called just before the worker manager is initialized
	fluxloaderAPI.gameWorld = s;
	logInfo("Game world initialized");
};

globalThis.fluxloader_onGameInstanceInitialized = (s) => {
	fluxloaderAPI.gameInstance = s;
	const scene = fluxloaderAPI.gameInstance.state.store.scene.active;
	logInfo(`Game instance loaded with scene ${scene}`);
	fluxloaderAPI.events.trigger(scene == 1 ? "fl:menu-loaded" : "fl:game-loaded");
};

globalThis.fluxloader_onWorkerMessage = (m) => {
	m.data.shift();
	const channel = m.data.shift();
	fluxloaderAPI._onWorkerMessage(channel, ...m.data);
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
			spawnSolid(fluxloaderAPI.gameInstance.state, origin.x + position.x, origin.y + position.y, particle);

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
