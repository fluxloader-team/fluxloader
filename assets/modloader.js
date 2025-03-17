
function createHTMLElement(html) {
	const container = document.createElement("div");
	container.innerHTML = html;
	return container.children[0];
}

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

// --------------------- CONFIG MENU ---------------------

class ConfigType {
	static allTypes = {};

	constructor(name, inputHTML, defaultValue, extraParams = {}) {
		this.name = name.toLowerCase();
		this.inputHTML = inputHTML;
		this.default = defaultValue;
		this.extraParams = extraParams;
		ConfigType.allTypes[this.name] = this;
	}

	apply(option) {
		option.inputHTML = this.inputHTML;
		option.default = option.default ?? this.default;
		option.configType = this;
		for (let param in this.extraParams) {
			option[param] = option[param] ?? this.extraParams[param];
		}
		return option;
	}

	static getType(name) {
		return ConfigType.allTypes[name.toLowerCase()];
	}
}

globalThis.saveCurrentConfigMenuMod = async function () {
	if (!globalThis.currentConfigMenuModData) return;

	let config = globalThis.currentConfigMenuModConfig;
	const modData = globalThis.currentConfigMenuModData;
	const configOptionsElement = document.getElementById("config-options");
	const inputElements = configOptionsElement.querySelectorAll(".config-menu-option");

	if (modData.options.length != inputElements.length) {
		console.log(`Mismatched number of config options and input elements for mod ${modData.modName}`);
		return;
	}

	inputElements.forEach((input, i) => {
		const optionIndex = input.getAttribute("option-index");
		const option = modData.options[optionIndex];

		if (!option) {
			console.log(`Missing option for input element in mod ${modData.modName}`);
			return;
		}

		let value = input.value;

		let jsonTypes = ["json", "slider", "boolean", "number"];
		if (jsonTypes.includes(option.configType.name)) {
			try {
				value = JSON.parse(value);
			} catch (error) {
				console.log(`Invalid JSON for option ${option.name} in mod ${modData.modName}`);
				// Skip this option
				return;
			}
		} else if (option.configType.name == "regex") {
			const regex = new RegExp(option.regex);
			if (!regex.test(value)) {
				console.log(`Invalid value for regex option ${option.name} in mod ${modData.modName}`);
				value = config[option.name];
			}
		}

		config[option.name] = value;
	});

	await globalThis.modConfig.set(modData.modName, config);
	globalThis.currentConfigMenuModConfig = null;
	globalThis.currentConfigMenuModData = null;
};

globalThis.getConfigMenuModOptionElement = function (option, optionIndex, config) {
	let value = config[option.name] ?? option.default;

	globalThis.handleConfigMenuBooleanClick = function (e, optionIndex) {
		let option = globalThis.currentConfigMenuModData.options[optionIndex];

		e.currentTarget.innerText = !JSON.parse(e.currentTarget.innerText);
		e.currentTarget.value = e.currentTarget.innerText;
	};

	globalThis.handleConfigMenuInputChanged = function (e, optionIndex) {
		let option = globalThis.currentConfigMenuModData.options[optionIndex];

		// Apply regex validation to the input
		if (option.configType.name === "regex") {
			const regex = new RegExp(option.regex);
			if (!regex.test(e.currentTarget.value)) {
				e.currentTarget.classList.add("border-red-500");
			} else {
				e.currentTarget.classList.remove("border-red-500");
			}
		}
	};

	globalThis.handleConfigMenuInputInputted = function (e, optionIndex) {
		let option = globalThis.currentConfigMenuModData.options[optionIndex];

		if (option.configType.name === "slider") {
			const value = Math.min(Math.max(e.currentTarget.value, option.min), option.max);
			e.currentTarget.previousElementSibling.children[1].innerText = value;
			e.currentTarget.value = value;
		}
	};

	switch (option.configType.name) {
		case "boolean":
			return `<button
				name="${option.name}" value="${value}" option-index="${optionIndex}"
				onclick="globalThis.handleConfigMenuBooleanClick(event, ${optionIndex})"
				class="w-full px-3 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:ring-blue-500 focus:border-blue-500 config-menu-option">
				${value}
			</button>`;

		case "dropdown":
			return;

		case "json":
			value = JSON.stringify(value);
			return `<textarea
				name="${option.name}" option-index="${optionIndex}"
				onchange="globalThis.handleConfigMenuInputChanged(event, ${optionIndex})"
				class="w-full px-3 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:ring-blue-500 focus:border-blue-500 config-menu-option">${value}</textarea>`;

		default:
			const args = option.inputHTML.replace(/{(.*?)}/g, (match, key) => option[key] || match);
			return `<input
				name="${option.name}" value="${value}" option-index="${optionIndex}" ${args}
				onchange="globalThis.handleConfigMenuInputChanged(event, ${optionIndex})" oninput="globalThis.handleConfigMenuInputInputted(event, ${optionIndex})"
				class="w-full bg-gray-700 text-white rounded border border-gray-600 focus:ring-blue-500 focus:border-blue-500 config-menu-option">`;
	}
};

globalThis.loadConfigMenuModData = function (mod, config) {
	const modName = mod.modinfo.name;
	let configMenuModData = { modName, options: [] };

	// Mod doesn't provide 'config' preset
	if (!mod.config) {
		configMenuModData.providedConfigPreset = false;
		configMenuModData.options = Object.keys(config).map((name) => {
			const value = config[name];
			let configType = ConfigType.getType("string");
			if (typeof value === "number") configType = ConfigType.getType("number");
			else if (typeof value === "boolean") configType = ConfigType.getType("boolean");
			else if (typeof value === "object") configType = ConfigType.getType("json");
			return configType.apply({ name, label: name });
		});
	}

	// Mod provides 'config' preset
	else {
		configMenuModData.providedConfigPreset = true;
		for (const optionPreset of mod.config) {
			// If a string then it's a simple string option
			if (typeof optionPreset == "string") {
				const option = { name: optionPreset, label: optionPreset };
				configMenuModData.options.push(ConfigType.getType("string").apply(option));
			}

			// Otherwise try and parse the object
			else {
				let option = optionPreset;
				option.label = option.label ?? option.name;

				if (!option.name) {
					console.log(`Missing name for option in ${modName} with raw option data: ${JSON.stringify(option)}`);
					continue;
				}

				if (typeof option.type === "undefined") {
					console.log(`Missing option type for option with name '${option.name}' of mod ${modName}, defaulting to string`);
					option.type = "string";
				}

				configMenuModData.options.push(ConfigType.getType(option.type).apply(option));
			}
		}
	}

	return configMenuModData;
};

globalThis.setConfigMenuMod = async (i) => {
	globalThis.saveCurrentConfigMenuMod();
	const mod = globalThis.activeMods[i];
	const modName = mod.modinfo.name;
	let config = await globalThis.modConfig.get(modName);
	let modData = globalThis.loadConfigMenuModData(mod, config);
	globalThis.currentConfigMenuModConfig = config;
	globalThis.currentConfigMenuModData = modData;

	const configOptions = document.getElementById("config-options");

	if (modData.options.length == 0) {
		const text = modData.providedConfigPreset
			? `Mod provided a 'config' preset but no options were found in the config file for this mod.`
			: `No 'config' preset was found for this mod, and no options were found in the config file for this mod.`;

		configOptions.innerHTML = `
			<h3 class="text-lg font-semibold mb-2 bg-gray-50">${modName} Settings</h3>
			<div class="space-y-2"><p class="text-gray-400">${text}</p></div>`;

		return;
	}

	function createOptionElement(option, optionIndex) {
		let typeLabel = option.configType.name;
		if (option.configType.name == "regex") {
			typeLabel += ` (${option.regex})`;
		}

		let optionalMidLabel = "";
		if (option.configType.name == "slider") {
			optionalMidLabel = `<span class="text-xs text-gray-400 mt-1">${config[option.name]}</span>`;
		}

		return `
		<div class="mb-3">
			<div class="flex justify-between">
				<label class="text-xs text-gray-400 mt-1">${option.label}</label>
				${optionalMidLabel}
				<span class="text-xs text-gray-400 mt-1">${typeLabel}</span>
			</div>
			${getConfigMenuModOptionElement(option, optionIndex, config)}
		</div>`;
	}

	configOptions.innerHTML = `
		<h3 class="text-lg font-semibold mb-2 ${modData.providedConfigPreset ? "bg-gray" : "bg-yellow"}">${modName} Settings</h3>
		<div class="space-y-2">${modData.options.map(createOptionElement).join("")}</div>`;
};

globalThis.setupConfigMenu = async function () {
	globalThis.currentConfigMenuModData = null;
	new ConfigType("string", `type="text"`, "no value");
	new ConfigType("number", `type="number"`, 1);
	new ConfigType("regex", `type="text"`, "no value", { regex: /.*/ });
	new ConfigType("slider", `type="range" min="{min}" max="{max}" step="{step}"`, 50, { min: 0, max: 100, step: 1 });
	new ConfigType("json", ``, {});
	new ConfigType("boolean", ``, false);
};

globalThis.closeConfigMenu = async function () {
	await globalThis.saveCurrentConfigMenuMod();
	document.removeEventListener("keydown", globalThis.configMenuKeydownListener);
	document.getElementById("config-menu").remove();
};

globalThis.openConfigMenu = function () {
	if (document.getElementById("config-menu")) return;

	const configMenuDiv = createHTMLElement(`
		<div id="config-menu"
			class="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-800 rounded-lg shadow-lg z-50 text-white"
			style="height: 60vh; width: 100vh; display: grid; grid-template-columns: 1fr 2fr;">
			<div class="w-full h-full overflow-auto scrollbar-none p-4" style="height: 50vh; -webkit-scrollbar: none;">
				<h2 class="text-lg font-semibold mb-4">Mods</h2>
				<div class="space-y-4">
					${globalThis.activeMods
						.map(
							(mod, i) => `
						<div class="flex items-center">
							<button class="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 w-full" onclick="globalThis.setConfigMenuMod(${i})">
								${mod.modinfo.name}
							</button>
						</div>`
						)
						.join("")}
				</div>
			</div>
			<div class="w-full overflow-auto scrollbar-none p-4" style="height: 50vh; -webkit-scrollbar: none;">
				<h2 class="text-lg font-semibold mb-4">Config</h2>
				<div id="config-options" class="flex-1">
					<h3 class="text-lg font-semibold mb-2">No mod selected</h3>
				</div>
			</div>
			<button id="close-config-menu"
				class="absolute bg-red-500 text-white rounded-full hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-600"
				style="right: 50px; top: 30px;">
				Close
			</button>
		</div>`);

	globalThis.configMenuKeydownListener = function (e) {
		if (e.key === "Escape") closeConfigMenu();
	};

	document.body.appendChild(configMenuDiv);
	document.addEventListener("keydown", globalThis.configMenuKeydownListener);
	const closeButton = document.getElementById("close-config-menu");
	closeButton.onclick = globalThis.closeConfigMenu;
};

globalThis.setupModdedSubtitle = function (spawnSolid) {
	const interval = setInterval(loop, 60);

	function loop() {
		if (globalThis.moddedSubtitleActivePositions && globalThis.moddedSubtitleActivePositions.length == 0) return clearInterval(interval);

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
			"3, 3": { x: 4, y: 4 },
			"5, 4": { x: 6, y: 3 },
			"9, 5": { x: 11, y: 5 },
			"12, 5": { x: 13, y: 4 },
			"12, 9": { x: 13, y: 10 },
			"16, 4": { x: 17, y: 5 },
			"16, 10": { x: 17, y: 9 },
			"18, 9": { x: 20, y: 9 },
			"21, 5": { x: 22, y: 4 },
			"27, 8": { x: 29, y: 8 },
			"30, 5": { x: 31, y: 4 },
			"36, 5": { x: 38, y: 5 },
			"39, 5": { x: 40, y: 4 },
			"39, 9": { x: 40, y: 10 },
			"45, 9": { x: 47, y: 9 },
			"48, 5": { x: 49, y: 4 },
		};

		const offsets = [
			[-1, 0],
			[0, 1],
			[1, 0],
			[0, -1],
		];

		for (const position of [...globalThis.moddedSubtitleActivePositions]) {
			spawnSolid(gameInstance.state, origin.x + position.x, origin.y + position.y, particle);

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

// --------------------- MODLOADER ---------------------

(async function () {
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
		// Call any unsafe preloads
		for (const mod of globalThis.activeMods) {
			await tryExecuteModFunction(mod, "onUnsafePreload");
		}
		// Wait for game state before loading anything else
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

	globalThis.activeMods = [];
	const modPaths = await (await fetch("modloader-api/active-mod-paths")).json();
	for (const modPath of modPaths) {
		const mod = await loadMod(modPath);
		if (mod == null) continue;
		globalThis.activeMods.push(mod);
	}

	console.log(`Mods loaded: [${globalThis.activeMods.map((m) => m.modinfo.name).join(", ")}]`);

	await setupConfigMenu();
	await executeModFunctions();
})();
