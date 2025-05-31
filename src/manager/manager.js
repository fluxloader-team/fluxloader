import { SchemaValidation } from "../common.js";

// Some arbitrary delays that make it all feel a bit smoother
const DELAY_DESCRIPTION_LOAD_MS = 800;
const DELAY_PLAY_MS = 150;
const DELAY_LOAD_REMOTE_MS = 150;

// ---------------- UTILITY ----------------

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

let _elements = {};
function getElement(id) {
	if (!_elements[id]) {
		_elements[id] = document.getElementById(id);
		if (!_elements[id]) {
			console.error(`Element with id ${id} not found`);
			return null;
		}
	}
	return _elements[id];
}

function createElement(html) {
	const template = document.createElement("template");
	template.innerHTML = html.trim();
	return template.content.firstChild;
}

function handleResizer(resizer) {
	let startX, startWidth, parent, isLeft;

	resizer.addEventListener("mousedown", (e) => {
		parent = e.target.parentElement;
		startX = e.pageX;
		startWidth = parent.offsetWidth;
		isLeft = resizer.classList.contains("left");
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	});

	resizer.addEventListener("click", (e) => {
		e.stopPropagation();
	});

	function onMouseMove(e) {
		const newWidth = startWidth + (e.pageX - startX) * (isLeft ? -1 : 1);
		parent.style.width = newWidth + "px";
	}

	function onMouseUp() {
		document.removeEventListener("mousemove", onMouseMove);
		document.removeEventListener("mouseup", onMouseUp);
	}
}

// ---------------- CONFIG ----------------

class ConfigSchemaElement {
	constructor(root, config, schema, onChange) {
		this.root = root;
		this.config = config;
		this.schema = schema;
		this.onChange = onChange;
		this.inputs = new Map();
		this.root.innerHTML = "";
		this.root.classList.add("config-schema-root");
		this.createSchemaSection(this.config, this.schema, this.root, []);
	}

	createSchemaSection(configSection, schemaSection, container, path) {
		// Mirrors the recursive search in the SchemaValidation.validate()
		// Search over all the properties of the current schema section level
		for (const [key, schemaValue] of Object.entries(schemaSection)) {
			const currentPath = [...path, key];

			// If it is not a leaf node then recurse into a new section
			if (!SchemaValidation.isSchemaLeafNode(schemaValue)) {
				const sectionContainer = document.createElement("div");
				sectionContainer.classList.add("config-section");
				const sectionTitle = document.createElement("h3");
				sectionTitle.classList.add("config-section-title");
				sectionTitle.textContent = key;
				sectionContainer.appendChild(sectionTitle);
				container.appendChild(sectionContainer);

				// Recurse into the next level
				logDebug(`Creating section for ${currentPath.join(".")}:`, schemaValue);
				this.createSchemaSection(configSection?.[key] ?? {}, schemaValue, sectionContainer, currentPath);
			}

			// Otherwise we want to render this leaf as an input
			else {
				const value = configSection?.[key] ?? schemaValue.default;
				const wrapper = document.createElement("div");
				const label = document.createElement("label");
				wrapper.classList.add("config-input-wrapper");
				label.classList.add("config-input-label");
				label.textContent = key;
				wrapper.appendChild(label);
				logDebug(`Rendering input for ${currentPath.join(".")}:`, schemaValue);

				// Create the input element based on the schema type
				let input;
				switch (schemaValue.type) {
					case "string":
						input = document.createElement("input");
						input.type = "text";
						input.value = value;
						break;
					case "number":
						input = document.createElement("input");
						input.type = "number";
						input.value = value;
						if ("min" in schemaValue) input.min = schemaValue.min;
						if ("max" in schemaValue) input.max = schemaValue.max;
						if ("step" in schemaValue) input.step = schemaValue.step;
						break;
					case "boolean":
						input = document.createElement("input");
						input.type = "checkbox";
						input.checked = value;
						break;
					case "dropdown":
						input = document.createElement("select");
						for (const option of schemaValue.options) {
							const opt = document.createElement("option");
							opt.value = option;
							opt.textContent = option;
							if (option === value) opt.selected = true;
							input.appendChild(opt);
						}
						break;
					case "object":
					case "array":
						// Not directly editable in this version
						continue;
					default:
						throw new Error(`Unsupported input type: ${schemaValue.type}`);
				}

				// Listen to the input then store it in the right places
				input.addEventListener("change", () => this.handleInputChange(currentPath, input, schemaValue));
				input.classList.add("config-input");
				this.inputs.set(currentPath.join("."), input);
				wrapper.appendChild(input);
				container.appendChild(wrapper);
			}
		}
	}

	handleInputChange(path, input, schema) {
		// First parse the value out of the input
		let value;
		if (schema.type === "boolean") value = input.checked;
		else if (schema.type === "number") value = parseFloat(input.value);
		else value = input.value;

		// Then validate it using the schema
		if (!SchemaValidation.validateValue(value, schema)) {
			input.classList.add("invalid");
			return;
		}

		// Finally assuming it is valid officially update the config
		input.classList.remove("invalid");
		this.setConfigValue(path, value);
		this.onChange(this.config);
	}

	setConfigValue(path, value) {
		// Set the corresponding value in the config object by navigating the path
		let obj = this.config;
		for (let i = 0; i < path.length - 1; i++) {
			const key = path[i];
			if (!Object.hasOwn(obj, key)) obj[key] = {};
			obj = obj[key];
		}
		obj[path.at(-1)] = value;
	}
}

// ---------------- MAIN ----------------

let isPlaying = false;
let isMainControlButtonLoading = false;
let connectionIndicatorState = "offline";
let selectedTab = null;
let tabs = {
	mods: null,
	config: null,
	console: null,
	options: null,
};

function setProgressText(text) {
	getElement("progress-bar-text").innerText = text;
}

function setProgress(percent) {
	getElement("progress-bar").style.width = `${percent}%`;
}

function setConnectionIndicator(state) {
	if (state === "offline") {
		getElement("online-indicator").classList.remove("online");
		getElement("online-indicator").classList.remove("connecting");
		getElement("online-indicator").classList.add("offline");
	} else if (state === "connecting") {
		getElement("online-indicator").classList.remove("offline");
		getElement("online-indicator").classList.remove("online");
		getElement("online-indicator").classList.add("connecting");
	} else if (state === "online") {
		getElement("online-indicator").classList.remove("offline");
		getElement("online-indicator").classList.remove("connecting");
		getElement("online-indicator").classList.add("online");
	} else {
		console.error(`Invalid state: ${state}`);
		return;
	}
	connectionIndicatorState = state;
}

function updateMainControlButtonText() {
	if (isMainControlButtonLoading) {
		getElement("main-control-button").innerText = "Loading...";
	} else {
		getElement("main-control-button").innerText = isPlaying ? "Stop" : "Start";
	}
}

function handleClickMainControlButton(button) {
	if (isMainControlButtonLoading) {
		logWarn("Main control button is already loading, ignoring click.");
		return;
	}

	if (tabs.mods.isLoadingInstalledMods || tabs.mods.isLoadingRemoteMods) {
		logWarn("Mods tab is currently loading, ignoring click.");
		return;
	}

	if (tabs.mods.isPerformingActions) {
		logWarn("Mods tab is currently performing actions, ignoring click.");
		return;
	}

	isMainControlButtonLoading = true;
	updateMainControlButtonText();
	getElement("main-control-button").classList.toggle("active", true);

	// Here we would normally change the functionality
	if (true) {
		togglePlaying();
	}
}

function togglePlaying() {
	setProgressText("Loading...");
	setProgress(0);

	if (!isPlaying) {
		setTimeout(() => {
			electron.invoke(`fl:start-game`).then(() => {
				setProgressText("Game started.");
				setProgress(100);

				isMainControlButtonLoading = false;
				isPlaying = true;
				updateMainControlButtonText();
				getElement("main-control-button").classList.toggle("active", true);

				// Wait for the game to finish
				electron.invoke(`fl:wait-for-game-closed`).then(() => {
					setProgressText("Game closed.");
					setProgress(0);

					isPlaying = false;
					updateMainControlButtonText();
					getElement("main-control-button").classList.toggle("active", false);
				});
			});
		}, DELAY_PLAY_MS);
	} else {
		electron.invoke(`fl:stop-game`).then(() => {
			setProgressText("Game stopped.");
			setProgress(0);

			isMainControlButtonLoading = false;
			isPlaying = false;
			updateMainControlButtonText("Start");
			getElement("main-control-button").classList.toggle("active", false);
		});
	}
}

async function setupTabs() {
	tabs.mods = new ModsTab();
	tabs.config = new ConfigTab();

	for (const tab in tabs) {
		getElement(`tab-${tab}`).addEventListener("click", async () => {
			await selectTab(tab);
		});

		if (tabs[tab]) {
			await tabs[tab].setup();
		}
	}
}

async function selectTab(tab) {
	if (selectedTab) {
		getElement(`tab-${selectedTab}`).classList.remove("selected");
		getElement(`${selectedTab}-tab-content`).style.display = "none";
		if (tabs[selectedTab]) await tabs[selectedTab].deselectTab();
	}

	selectedTab = tab;

	getElement(`tab-${tab}`).classList.add("selected");
	getElement(`${tab}-tab-content`).style.display = "block";
	if (tabs[tab]) await tabs[tab].selectTab();
}

function convertUploadTimeToString(uploadTime) {
	if (uploadTime == null) return "";
	const date = new Date(uploadTime);
	const now = new Date();
	const diff = now - date;

	// if within 1 minute, show as seconds
	if (diff < 60 * 1000) {
		const seconds = Math.floor(diff / 1000);
		return `${seconds}s ago`;
	}

	// if within 24 hours, show as hours:minutes
	if (diff < 24 * 60 * 60 * 1000) {
		const hours = Math.floor(diff / (60 * 60 * 1000));
		const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
		if (hours === 0) return `${minutes}m ago`;
		else return `${hours}h ${minutes}m ago`;
	}

	// if within 30 days, show as days:hours
	if (diff < 30 * 24 * 60 * 60 * 1000) {
		const days = Math.floor(diff / (24 * 60 * 60 * 1000));
		const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
		return `${days}d ${hours}h ago`;
	}

	// if older than 30 days, show as date
	const options = { year: "numeric", month: "2-digit", day: "2-digit" };
	const formattedDate = date.toLocaleDateString("en-US", options);
	const formattedTime = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
	return `${formattedDate} ${formattedTime}`;
}

class ModsTab {
	static PAGE_SIZE = 200;

	columns = {};
	currentModPage = 0;
	modRows = {};
	selectedMod = null;
	filterInfo = { search: null, tags: [] };
	queuedActions = [];
	isLoadingInstalledMods = false;
	isLoadingRemoteMods = false;
	isPerformingActions = false;

	// --- Setup ---

	setup() {
		getElement("mods-tab-table")
			.querySelectorAll("th")
			.forEach((element) => {
				const column = element.getAttribute("data-column");
				this.columns[column] = { element };
			});

		getElement("mods-tab-search").addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				this.onSearchChanged();
			}
		});

		getElement("mods-tab-search-button").addEventListener("click", () => {
			this.onSearchChanged();
		});

		getElement("mods-load-button").addEventListener("click", () => {
			this.loadMoreIntoModsView();
		});
	}

	selectTab() {
		this.reloadModsView();
	}

	deselectTab() {
		this.setModButtons([]);
		this.setModInfo(null);
	}

	async reloadModsView() {
		if (this.isLoadingInstalledMods || this.isLoadingRemoteMods) return;
		this.isLoadingInstalledMods = true;

		this.setLoadButtonText("Loading...");
		setProgressText("Getting installed mods...");
		setProgress(0);

		const tbody = getElement("mods-tab-table").querySelector("tbody");
		tbody.innerHTML = "";
		this.modRows = {};
		this.currentModPage = 0;

		// The mod list should always have installed mods first
		// Look for 'find-installed-mods' for where they are actually reloaded on the backend
		const mods = await electron.invoke("fl:get-installed-mods");

		let newModIDs = [];
		for (const mod of mods) {
			// We need to manually filter the installed mods here
			if (this.filterInfo.search) {
				const check = this.filterInfo.search.toLowerCase();
				let matched = false;
				matched |= mod.info.modID.toLowerCase().includes(check);
				matched |= mod.info.name.toLowerCase().includes(check);
				matched |= mod.info.version.toLowerCase().includes(check);
				matched |= mod.info.author.toLowerCase().includes(check);
				if (mod.info.shortDescription) matched |= mod.info.shortDescription.toLowerCase().includes(check);
				if (mod.info.description) matched |= mod.info.description.toLowerCase().includes(check);
				if (!matched) continue;
			}

			// And now convert them to the modData format and put into the table
			let modData = {
				modID: mod.info.modID,
				meta: {
					info: mod.info,
					votes: null,
					lastUpdated: "",
				},
				isLocal: true,
				isInstalled: true,
				isLoaded: mod.isLoaded,
				isEnabled: mod.isEnabled,
			};

			if (modData.meta.info.description && modData.meta.info.description.length > 0) {
				const html = await electron.invoke("fl:render-markdown", modData.meta.info.description);
				modData.renderedDescription = html;
			}

			this.modRows[modData.modID] = this.createModRow(modData);
			newModIDs.push(modData.modID);
		}

		for (const modID of newModIDs) {
			tbody.appendChild(this.modRows[modID].element);
		}

		// Load remote mods on reload if we are allowed to connect
		if (connectionIndicatorState === "online") {
			await this.loadMoreIntoModsView();
		}

		setProgressText("Reloaded mods.");
		this.setLoadButtonText("Load more mods");
		this.isLoadingInstalledMods = false;

		// Reselect the selected mod if it is still visible
		if (this.selectedMod != null) {
			const oldSelectedMod = this.selectedMod;
			this.selectedMod = null;
			this.selectMod(oldSelectedMod);
		}
	}

	async loadMoreIntoModsView() {
		if (this.isLoadingRemoteMods) return;
		this.isLoadingRemoteMods = true;

		this.setLoadButtonText("Loading...");
		setConnectionIndicator("connecting");
		setProgressText("Getting remote mods...");
		setProgress(0);

		const getInfo = {
			search: this.filterInfo.search,
			tags: this.filterInfo.tags,
			pageSize: ModsTab.PAGE_SIZE,
			page: this.currentModPage + 1,
		};

		const startTime = Date.now();
		const mods = await electron.invoke("fl:fetch-remote-mods", getInfo);
		const endTime = Date.now();

		if (endTime - startTime < DELAY_LOAD_REMOTE_MS) {
			await new Promise((resolve) => setTimeout(resolve, DELAY_LOAD_REMOTE_MS - (endTime - startTime)));
		}

		if (mods == null || mods == []) {
			this.setLoadButtonText("Load mods");
			setConnectionIndicator("offline");
			setProgressText("No remote mods available.");
			this.isLoadingRemoteMods = false;
			return;
		}

		const tbody = getElement("mods-tab-table").querySelector("tbody");
		let newModIDs = [];
		for (const mod of mods) {
			if (this.modRows[mod.modID] != null) {
				logDebug(`Skipping already existing mod: ${mod.modID}`);
				continue;
			}

			// Convert into modData format and put into the table
			let modData = {
				modID: mod.modID,
				meta: {
					info: mod.modData,
					votes: mod.votes,
					lastUpdated: convertUploadTimeToString(mod.uploadTime),
				},
				isLocal: false,
				isInstalled: false,
				isLoaded: false,
				isEnabled: false,
			};

			if (modData.meta.info.description && modData.meta.info.description.length > 0) {
				const html = await electron.invoke("fl:render-markdown", modData.meta.info.description);
				modData.renderedDescription = html;
			}

			this.modRows[modData.modID] = this.createModRow(modData);
			newModIDs.push(modData.modID);
		}

		for (const modID of newModIDs) {
			tbody.appendChild(this.modRows[modID].element);
		}

		setProgressText("Fetched remote mods successfully.");
		setConnectionIndicator("online");
		this.setLoadButtonText("Load more mods");
		this.isLoadingRemoteMods = false;
		this.currentModPage++;
	}

	createModRow(modData) {
		const element = createElement(
			`
			<tr>
				<td>
				` +
				// TODO: Here we want to show a download option if the mod is not installed
				(modData.isInstalled ? `<input type="checkbox" ${modData.isEnabled ? "checked" : ""}>` : ``) +
				`
				</td>
				<td>${modData.meta.info.name}</td>
				<td>${modData.meta.info.author}</td>
				<td>${modData.meta.info.version}</td>
				<td>${modData.meta.info.shortDescription || ""}</td>
				<td>${modData.meta.lastUpdated}</td>
				<td class="mods-tab-table-tag-list">
				${
					modData.meta.info.tags
						? modData.meta.info.tags.reduce((acc, tag) => {
								return acc + `<span class="tag">${tag}</span>`;
						  }, "")
						: ""
				}
				</td>
			</tr>
		`
		);

		element.classList.toggle("disabled", modData.isInstalled && !modData.isEnabled);
		element.addEventListener("click", (e) => this.selectMod(modData.modID));

		if (modData.isInstalled) {
			const checkbox = element.querySelector("input[type='checkbox']");
			checkbox.addEventListener("click", (e) => e.stopPropagation());
			checkbox.addEventListener("change", (e) => {
				const checkbox = e.target;
				const isChecked = checkbox.checked;
				checkbox.disabled = true;
				electron.invoke("fl:set-mod-enabled", { modID: modData.modID, enabled: isChecked }).then((success) => {
					checkbox.disabled = false;

					if (!success) {
						checkbox.checked = !isChecked;
						setProgressText("Failed to set mod enabled state.");
					}

					modData.isEnabled = checkbox.checked;
					element.classList.toggle("disabled", modData.isInstalled && !modData.isEnabled);
				});
			});
		}

		return { element, modData, isVisible: true };
	}

	// --- Main ---

	selectMod(modID) {
		if (this.selectedMod !== null && this.selectedMod === modID) {
			this.modRows[this.selectedMod].element.classList.remove("selected");
			this.setModInfo(null);
			this.selectedMod = null;
			return;
		}
		if (this.selectedMod !== null) {
			this.modRows[this.selectedMod].element.classList.remove("selected");
		}

		if (modID != null) {
			if (this.modRows[modID] == null) return;
			this.selectedMod = modID;
			this.modRows[modID].element.classList.add("selected");
			this.setModInfo(modID);
		}
	}

	setModInfo(modID) {
		if (modID == null) {
			getElement("mod-info").style.display = "none";
			getElement("mod-info-empty").style.display = "block";
			this.setModButtons([]);
			return;
		}

		const modData = this.modRows[modID].modData;

		getElement("mod-info").style.display = "block";
		getElement("mod-info-empty").style.display = "none";

		getElement("mod-info-title").innerText = modData.meta.info.name;

		if (modData.meta.info.description && modData.meta.info.description.length > 0) {
			getElement("mod-info-description").classList.remove("empty");
			getElement("mod-info-description").innerHTML = modData.renderedDescription;
		} else {
			getElement("mod-info-description").classList.add("empty");
			getElement("mod-info-description").innerText = "No description provided.";
		}

		getElement("mod-info-mod-id").innerText = modData.modID;
		getElement("mod-info-author").innerText = modData.meta.info.author;
		getElement("mod-info-version").innerText = modData.meta.info.version;
		getElement("mod-info-last-updated").innerText = modData.meta.lastUpdated;

		if (modData.meta.info.tags) {
			getElement("mod-info-tags").classList.toggle("empty", modData.meta.info.tags.length === 0);
			if (modData.meta.info.tags.length === 0) {
				getElement("mod-info-tags").innerText = "No tags provided.";
			} else {
				getElement("mod-info-tags").innerHTML = "";
				for (const tag of modData.meta.info.tags) {
					const tagElement = createElement(`<span class="tag">${tag}</span>`);
					getElement("mod-info-tags").appendChild(tagElement);
				}
			}
		}

		if (modData.isInstalled) {
			this.setModButtons([
				{
					text: "Uninstall",
					onClick: () => {
						this.queueUninstall(modData.modID);
					},
				},
			]);
		} else {
			this.setModButtons([
				{
					text: "Install",
					onClick: () => {
						this.queueInstall(modData.modID, modData.meta.info.version);
					},
				},
			]);
		}
	}

	setModButtons(buttons) {
		if (buttons.length == 0) {
			getElement("mod-buttons").style.display = "none";
			return;
		}

		getElement("mod-buttons").style.display = "flex";

		for (let i = 1; i <= 2; i++) {
			const button = getElement(`mod-button-${i}`);

			if (buttons.length < i) {
				button.style.display = "none";
				continue;
			}

			button.innerText = buttons[i - 1].text;
			button.onclick = buttons[i - 1].onClick;
			button.style.display = "block";
		}
	}

	setLoadButtonText(text) {
		getElement("mods-load-button").innerText = text;
	}

	// --- Queueing and Actions ---

	queueInstall(modID, version) {
		if (this.isPerformingActions) return;
		logInfo(`Installing mod ${modID} version ${version}`);
		this.queuedActions.push({ action: "install", modID, version });
		this.addQueueElement(this.queuedActions[this.queuedActions.length - 1]);
	}

	queueUninstall(modID) {
		if (this.isPerformingActions) return;
		logInfo(`Uninstalling mod ${modID}`);
		this.queuedActions.push({ action: "uninstall", modID });
		this.addQueueElement(this.queuedActions[this.queuedActions.length - 1]);
	}

	addQueueElement(action) {}

	performQueuedActions() {
		this.isPerformingActions = true;
	}

	// --- Filtering ---

	onSearchChanged() {
		const searchInput = getElement("mods-tab-search").value.toLowerCase();
		this.filterInfo.search = searchInput;
		this.reloadModsView();
	}

	onSelectedTagsChanged() {
		// TODO
		this.reloadModsView();
	}

	removeFiltering() {
		this.filterInfo.search = null;
		this.filterInfo.tags = [];
		this.reloadModsView();
	}
}

class ConfigTab {
	config = null;
	configSchema = null;
	renderer = null;

	async setup() {
		logInfo("ConfigTab setup called");

		this.config = await electron.invoke("fl:get-fluxloader-config");
		this.configSchema = await electron.invoke("fl:get-fluxloader-config-schema");
		this.renderer = new ConfigSchemaElement(getElement("config-root"), this.config, this.configSchema, () => {
			logInfo("Config changed");
		});
	}

	selectTab() {
		// TODO
	}

	deselectTab() {
		// TODO
	}
}

// ---------------- DRIVER ----------------

(async () => {
	await setupTabs();

	getElement("main-control-button").addEventListener("click", () => handleClickMainControlButton());

	document.querySelectorAll(".resizer").forEach(handleResizer);

	getElement("refresh-mods").addEventListener("click", () => {
		electron.invoke("fl:find-installed-mods").then(() => tabs.mods.reloadModsView());
	});

	setProgressText("");
	setProgress(0);
	selectTab("mods");
})();
