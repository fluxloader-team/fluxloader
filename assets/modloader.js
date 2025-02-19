(async function () {
	globalThis.modConfig = {
		get: async (modName) => {
			try {
				const data = {
					modName: modName,
				};
				const response = await fetch("modloader-api/config", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(data),
				});

				if (!response.ok) {
					return false;
				}

				return await response.json();
			} catch (error) {
				return null;
			}
		},
		set: async (modName, config) => {
			try {
				const data = {
					modName: modName,
					config: config,
				};
				const response = await fetch("modloader-api/config", {
					method: "SET",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(data),
				});

				return response.ok;
			} catch (error) {
				return false;
			}
		},
	};
	async function tryExecuteModFunction(mod, functionName) {
		if (Object.prototype.hasOwnProperty.call(mod, functionName)) {
			try {
				mod[functionName]();
			} catch (err) {
				console.error(`Error executing ${functionName} for mod '${mod.modinfo.name}': `, err);
			}
		} else {
			console.warn(`No function '${functionName}' found for mod '${mod.modinfo.name}'.`);
		}
	}

	async function executeModFunctions() {
		// Wait for game state before loading anything
		if (!Object.prototype.hasOwnProperty.call(window, "__debug")) {
			await new Promise((resolve) => {
				Object.defineProperty(window, "__debug", {
					set: (value) => {
						globalThis.gameInstance = value;
						resolve();
					},
					get: () => {
						return globalThis.gameInstance;
					},
				});
			});
		} else {
			globalThis.gameInstance = window.__debug;
		}

		const scene = gameInstance.state.store.scene.active;
		console.log(`Game state loaded with scene ${scene}, starting mod execution.`);

		if (scene == 1) {
			for (const mod of globalThis.activeMods) {
				await tryExecuteModFunction(mod, "onMenuLoaded");
			}
		} else if (scene == 2 || scene == 3) {
			for (const mod of globalThis.activeMods) {
				await tryExecuteModFunction(mod, "onGameLoaded");
			}
		}
	}

	async function loadMod(modName) {
		try {
			const response = await fetch(modName);
			if (!response.ok) {
				console.error(`Failed to load mod '${modName}'`);
				return null;
			}
			const modScript = await response.text();
			const modExports = {};
			const modWrapper = new Function("exports", modScript);
			modWrapper(modExports);
			return modExports;
		} catch (err) {
			console.error(`Error loading mod '${modName}': `, err);
			return null;
		}
	}

	globalThis.moddedSubtitle = function (spawnSolid) {
		if (globalThis.moddedSubtitleActivePositions && globalThis.moddedSubtitleActivePositions.length == 0) return;
		const title = [
			[1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
			[1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
			[1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
			[1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1],
			[1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1],
			[1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1],
			[1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1],
			[1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1],
			[1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1],
			[1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1],
			[1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1],
			[1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1],
		];
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
		// Allow jumping across gaps to designated coordinates
		const jumps = {
			"3, 3": {
				x: 4,
				y: 4,
			},
			"5, 4": {
				x: 6,
				y: 3,
			},
			"9, 5": {
				x: 11,
				y: 5,
			},
			"12, 5": {
				x: 13,
				y: 4,
			},
			"12, 9": {
				x: 13,
				y: 10,
			},
			"16, 4": {
				x: 17,
				y: 5,
			},
			"16, 10": {
				x: 17,
				y: 9,
			},
			"18, 9": {
				x: 20,
				y: 9,
			},
			"21, 5": {
				x: 22,
				y: 4,
			},
			"27, 8": {
				x: 29,
				y: 8,
			},
			"30, 5": {
				x: 31,
				y: 4,
			},
			"36, 5": {
				x: 38,
				y: 5,
			},
			"39, 5": {
				x: 40,
				y: 4,
			},
			"39, 9": {
				x: 40,
				y: 10,
			},
			"45, 9": {
				x: 47,
				y: 9,
			},
			"48, 5": {
				x: 49,
				y: 4,
			},
		};
		const offsets = [
			[-1, 0],
			[0, 1],
			[1, 0],
			[0, -1],
		];
		for (const position of [...globalThis.moddedSubtitleActivePositions]) {
			const posName = `${position.x}, ${position.y}`;
			spawnSolid(gameInstance.state, origin.x + position.x, origin.y + position.y, particle);
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
	};

	globalThis.activeMods = [];
	const modPaths = await (await fetch("modloader-api/active-mod-paths")).json();
	for (const modPath of modPaths) {
		const mod = await loadMod(modPath);
		if (mod == null) continue;
		globalThis.activeMods.push(mod);
	}

	console.log(`Mods loaded: [${globalThis.activeMods.map((m) => m.modinfo.name).join(", ")}]`);

	await executeModFunctions();
})();
