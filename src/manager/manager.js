import { SchemaValidation, Logging } from "../common.js";

// =================== VARIABLES ===================

const DELAY_DESCRIPTION_LOAD_MS = 800;
const DELAY_PLAY_MS = 150;
const DELAY_LOAD_REMOTE_MS = 150;

globalThis.tabs = { mods: null, config: null, logs: null };

let isPlaying = false;
let isMainControlButtonLoading = false;
let connectionState = "offline";
let selectedTab = null;
let getElementMemoization = {};
let isNotifying = false;

// =================== LOGGING ===================

globalThis.log = function (level, tag, message) {
	const timestamp = new Date();
	console.log(`${Logging.logHead(timestamp, level, tag)} ${message}`);
	forwardManagerLog({ source: "manager", timestamp, level, tag, message });
};

globalThis.logDebug = (...args) => log("debug", "", args.join(" "));
globalThis.logInfo = (...args) => log("info", "", args.join(" "));
globalThis.logWarn = (...args) => log("warn", "", args.join(" "));
globalThis.logError = (...args) => log("error", "", args.join(" "));

function forwardManagerLog(log) {
	tabs.logs.addLog(log);
}

// =================== UTILITY ===================

function getElement(id) {
	if (!getElementMemoization[id]) {
		getElementMemoization[id] = document.getElementById(id);
		if (!getElementMemoization[id]) {
			logError(`Element with id ${id} not found`);
			return null;
		}
	}
	return getElementMemoization[id];
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

// =================== MAIN ===================

class ConfigSchemaElement {
	parentElement = null;
	containerElement = null;
	contentElement = null;
	config = null;
	schema = null;
	onChange = null;
	inputs = new Map();
	statusElements = { wrapper: null, text: null, image: null };

	constructor(parentElement, config, schema, onChange) {
		// Initialize variables
		this.parentElement = parentElement;
		this.containerElement = null;
		this.contentElement = null;
		this.config = JSON.parse(JSON.stringify(config));
		this.schema = schema;
		this.onChange = onChange;
		this.inputs = new Map();
		this.statusElements = { wrapper: null, text: null, image: null };

		// Setup elements
		this.containerElement = document.createElement("div");
		this.containerElement.classList.add("config-schema-container");
		this.parentElement.appendChild(this.containerElement);
		this.contentElement = document.createElement("div");
		this.contentElement.classList.add("config-schema-content");
		this.statusElements.wrapper = document.createElement("div");
		this.statusElements.wrapper.classList.add("config-schema-validated");
		this.statusElements.text = document.createElement("span");
		this.statusElements.text.classList.add("config-schema-validated-text");
		this.statusElements.image = document.createElement("img");
		this.statusElements.image.classList.add("config-schema-validated-image");
		this.statusElements.wrapper.appendChild(this.statusElements.image);
		this.statusElements.wrapper.appendChild(this.statusElements.text);
		this.statusElements.image.src = "assets/refresh.png";
		this.statusElements.text.textContent = "Schema validation not yet performed.";
		this.containerElement.appendChild(this.contentElement);
		this.containerElement.appendChild(this.statusElements.wrapper);

		this.rerender();
	}

	forceSetConfig(config) {
		this.config = JSON.parse(JSON.stringify(config));
		this.rerender();
	}

	forceSetSchema(schema) {
		this.schema = schema;
		this.rerender();
	}

	rerender() {
		this.contentElement.innerHTML = "";
		this.inputs.clear();
		this._setStatus("valid");
		this._createSchemaSection(this.config, this.schema, this.contentElement, []);
	}

	// ------------ INTERNAL ------------

	_createSchemaSection(configSection, schemaSection, container, path) {
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
				this._createSchemaSection(configSection?.[key] ?? {}, schemaValue, sectionContainer, currentPath);
			}

			// Otherwise we want to render this leaf as an input
			else {
				if (schemaValue.hidden && schemaValue.hidden === true) {
					continue;
				}

				// Create the input element based on the schema type
				const value = configSection?.[key] ?? schemaValue.default;
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
						let selected = false;
						for (const option of schemaValue.options) {
							const opt = document.createElement("option");
							opt.value = option;
							opt.textContent = option;
							if (option === value) {
								opt.selected = true;
								selected = true;
							}
							input.appendChild(opt);
						}
						if (!selected) {
							let opt = document.createElement("option");
							opt.value = value;
							opt.textContent = value;
							opt.selected = true;
							opt.hidden = true;
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
				this.inputs.set(currentPath.join("."), input);
				input.addEventListener("change", () => this._handleInputChange(currentPath, input, schemaValue));
				input.classList.add("config-input");

				// Create the elements for the input
				const wrapper = document.createElement("div");
				wrapper.classList.add("config-input-wrapper");
				const labelRow = document.createElement("div");
				labelRow.classList.add("config-input-label-row");
				const label = document.createElement("label");
				label.classList.add("config-input-label");
				label.textContent = key;
				labelRow.appendChild(label);
				if (schemaValue.description) {
					const desc = document.createElement("span");
					desc.classList.add("config-input-description");
					desc.textContent = schemaValue.description;
					labelRow.appendChild(desc);
				}
				if (schemaValue.type === "boolean") {
					wrapper.classList.add("same-row");
					wrapper.appendChild(input);
					wrapper.appendChild(labelRow);
				} else {
					wrapper.appendChild(labelRow);
					wrapper.appendChild(input);
				}
				container.appendChild(wrapper);

				// Validate the input value immediately
				this._validateInput(input, schemaValue);
			}
		}
	}

	_handleInputChange(path, input, schemaValue) {
		const ret = this._validateInput(input, schemaValue);
		if (ret.valid) {
			input.classList.remove("invalid");
			this._setConfigValue(path, ret.value);
			this._setStatus("valid");
			this.onChange(this.config);
		}
	}

	_validateInput(input, schemaValue) {
		// Parse the value out of the input
		let value;
		if (schemaValue.type === "boolean") value = input.checked;
		else if (schemaValue.type === "number") value = parseFloat(input.value);
		else value = input.value;

		// Then validate it using the schema
		if (!SchemaValidation.validateValue(value, schemaValue)) {
			input.classList.add("invalid");
			this._setStatus("invalid");
			return { value, valid: false };
		}

		return { value, valid: true };
	}

	_getConfigValue(path) {
		// Get the corresponding value in the config object by navigating the path
		let obj = this.config;
		for (const key of path) {
			if (!Object.hasOwn(obj, key)) return undefined;
			obj = obj[key];
		}
		return obj;
	}

	_setConfigValue(path, value) {
		// Set the corresponding value in the config object by navigating the path
		let obj = this.config;
		for (let i = 0; i < path.length - 1; i++) {
			const key = path[i];
			if (!Object.hasOwn(obj, key)) obj[key] = {};
			obj = obj[key];
		}
		obj[path.at(-1)] = value;
	}

	_setStatus(status) {
		if (status === "valid") {
			this.statusElements.wrapper.classList.add("valid");
			this.statusElements.wrapper.classList.remove("invalid");
			const now = new Date();
			this.statusElements.text.textContent = "Config is valid (" + now.toLocaleTimeString() + ")";
			this.statusElements.image.src = "assets/check.png";
		} else if (status === "invalid") {
			this.statusElements.wrapper.classList.add("invalid");
			this.statusElements.wrapper.classList.remove("valid");
			this.statusElements.text.textContent = "Config is invalid.";
			this.statusElements.image.src = "assets/cross.png";
		}
	}
}

class ModsTab {
	static PAGE_SIZE = 200;

	columns = {};
	currentModPage = 0;
	modRows = {};
	selectedMod = null;
	filterInfo = { search: null, tags: [] };
	mainQueuedActions = {};
	allQueuedActions = {};
	hasLoadedOnce = false;
	isViewingModConfig = false;
	isLoadingMods = false;
	isActionQueueVisible = false;
	isQueueingAction = false;
	isPerformingActions = false;

	// ------------ SETUP ------------

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

		getElement("mods-tab-action-queue-selection").addEventListener("click", () => {
			this.toggleActionQueue(!this.isActionQueueVisible);
		});

		getElement("refresh-mods").addEventListener("click", async () => {
			await this.reloadMods();
		});

		getElement("mods-load-button").addEventListener("click", async () => {
			await this.loadMoreMods();
		});
	}

	selectTab() {
		// Only reload the table on the first opening of this tab
		if (!this.hasLoadedOnce) {
			this.hasLoadedOnce = true;
			this.reloadMods();
		}
	}

	// ------------ MAIN ------------
	// Functions used by events or from outside this class

	async reloadMods() {
		if (this.isLoadingMods || this.isPerformingActions) return;
		this.isLoadingMods = true;

		this.setLoadButtonText("Loading...");
		setProgressText("Reloading all mods...");
		setProgress(0);

		// We want to fully reload the entire mod table
		// This means first updating and fetching the installed mods
		// Then fetching all remote mods

		// Reset the mod table
		const tbody = getElement("mods-tab-table").querySelector("tbody");
		tbody.innerHTML = "";
		this.modRows = {};
		this.currentModPage = 0;

		// Update then fetch the installed mods
		const res = await api.invoke("fl:find-installed-mods");
		if (!res.success) {
			logError("Failed to find installed mods:", res.error);
			this.setLoadButtonText("Load mods");
			setProgressText("Failed to find installed mods");
			this.isLoadingMods = false;
			return;
		}

		await this._loadInstalledMods();

		// If we are connected then fetch remote mods
		if (connectionState === "online") await this._loadMoreRemoteMods();

		// Reselect the selected mod if it is still visible
		if (this.selectedMod != null) {
			const oldSelectedMod = this.selectedMod;
			this.selectedMod = null;
			this.selectMod(oldSelectedMod);
		}

		this.isLoadingMods = false;
		this.setLoadButtonText("Load more mods");
		setProgressText("Reloaded mods");
	}

	async loadMoreMods() {
		if (this.isLoadingMods || this.isPerformingActions) return;
		this.isLoadingMods = true;

		this.setLoadButtonText("Loading...");
		setProgressText("Loading more mods...");
		setProgress(0);

		// If this is used when offline then try go online
		// When going online for the first time this will include loading versions for installed mods

		// Go online and load installed mods versions
		if (connectionState === "offline") {
			setConnectionState("connecting");
			await this._loadInstalledModsVersions();
		}

		await this._loadMoreRemoteMods();

		this.isLoadingMods = false;
		this.setLoadButtonText("Load more mods");
		setProgressText("Loaded mods");
		setProgress(0);
	}

	async selectMod(modID) {
		await this._setViewingModConfig(false);

		// Deselect a mod and remove all mod info
		if (this.selectedMod !== null) {
			this.modRows[this.selectedMod].element.classList.remove("selected");
			if (this.selectedMod === modID) {
				getElement("mod-info-title").innerText = "Mod Name";
				getElement("mod-info").style.display = "none";
				getElement("mod-info-empty").style.display = "block";
				this._setModButtons([]);
				this.selectedMod = null;
				return;
			}
		}

		// Select a mod and show its info
		if (modID != null) {
			if (this.modRows[modID] == null) return;
			this.selectedMod = modID;
			this.modRows[modID].element.classList.add("selected");
			const modData = this.modRows[modID].modData;

			// Update title
			getElement("mod-info-title").innerText = modData.info.name;

			// Update the mod info section
			getElement("mod-info").style.display = "block";
			getElement("mod-info-empty").style.display = "none";

			if (modData.renderedDescription) {
				getElement("mod-info-description").classList.remove("empty");
				modData.renderedDescription = modData.renderedDescription.replace(/<a /g, '<a target="_blank" ');
				getElement("mod-info-description").innerHTML = modData.renderedDescription;
			} else {
				getElement("mod-info-description").classList.add("empty");
				getElement("mod-info-description").innerText = "No description provided.";
			}

			getElement("mod-info-mod-id").innerText = modData.modID;
			getElement("mod-info-author").innerText = modData.info.author;
			getElement("mod-info-version").innerText = modData.info.version;
			getElement("mod-info-last-updated").innerText = modData.lastUpdated;
			if (modData.info.tags) {
				getElement("mod-info-tags").classList.toggle("empty", modData.info.tags.length === 0);
				if (modData.info.tags.length === 0) {
					getElement("mod-info-tags").innerText = "No tags provided.";
				} else {
					getElement("mod-info-tags").innerHTML = "";
					for (const tag of modData.info.tags) {
						const tagElement = createElement(`<span class="tag">${tag}</span>`);
						getElement("mod-info-tags").appendChild(tagElement);
					}
				}
			}

			// Update the mod info buttons
			let buttons = [];
			if (modData.isInstalled) {
				buttons.push({ text: "Uninstall", onClick: () => this.clickSelectedModMainButton(modData.modID) });
				if (modData.info.configSchema) {
					buttons.push({ icon: "assets/config.png", onClick: () => this._setViewingModConfig(!this.isViewingModConfig), toggle: true });
				}
			} else {
				buttons.push({ text: "Install", onClick: () => this.clickSelectedModMainButton(modData.modID) });
			}
			this._setModButtons(buttons);
		}
	}

	async changeModVersion(modID, e) {
		// Grab the version and block anything further
		const wantedVersion = e.target.value;
		e.target.value = this.modRows[modID].modData.info.version;
		e.preventDefault();

		if (this.isLoadingMods || this.isPerformingActions) {
			logWarn("Cannot change mod version as mods are currently loading or actions are being performed.");
			return;
		}
		this.isLoadingMods = true;

		setProgressText(`Changing mod '${modID}' version to ${wantedVersion}...`);
		setProgress(0);

		if (!this.modRows[modID]) {
			logError(`Mod row for '${modID}' does not exist, cannot change version.`);
			this.isLoadingMods = false;
			return;
		}

		// Fetch remote version
		logDebug(`Changing mod '${modID}' version to ${wantedVersion}`);
		const res = await api.invoke("fl:get-mod-version", { modID, version: wantedVersion, rendered: true });
		if (!res.success) {
			logError(`Failed to change mod '${modID}' version to ${wantedVersion}`);
			setProgressText("Failed to change mod version");
			setProgress(0);
			this.isLoadingMods = false;
			return;
		}

		// Convert into modData format and put into the table
		const versionMod = res.data;
		let modData = {
			modID: versionMod.modID,
			info: versionMod.modData,
			votes: versionMod.votes,
			lastUpdated: convertUploadTimeToString(versionMod.uploadTime),
			renderedDescription: versionMod.renderedDescription,
			versions: this.modRows[modID].modData.versions, // The versions have not changed (and also not returned here)
			isInstalled: false,
			isEnabled: false,
		};

		this._updateModRow(modData);

		// Reselect the mod so that mod info is updated
		if (this.selectedMod === modID) {
			this.selectedMod = null;
			this.selectMod(modID);
		}

		this.isLoadingMods = false;
		setProgressText(`Changed mod '${modID}' version to ${wantedVersion}`);
		setProgress(0);
	}

	async changeModEnabled(modID, e) {
		// Grab the value and block anything further
		const checkbox = e.target;
		const previousEnabled = !checkbox.checked;
		const wantedEnabled = checkbox.checked;
		checkbox.checked = previousEnabled;
		checkbox.disabled = true;

		if (this.isLoadingMods || this.isPerformingActions) {
			logWarn("Cannot change mod enabled state as mods are currently loading or actions are being performed.");
			return;
		}
		this.isLoadingMods = true;

		// Request backend to change the mod enabled state
		const res = await api.invoke("fl:set-mod-enabled", { modID, enabled: wantedEnabled });
		const modRow = this.modRows[modID];
		if (!res.success) {
			setProgressText(`Failed to change mod '${modID}' enabled state`);
			modRow.modData.isEnabled = previousEnabled;
			checkbox.checked = previousEnabled;
		} else {
			modRow.modData.isEnabled = wantedEnabled;
			checkbox.checked = wantedEnabled;
		}
		modRow.element.classList.toggle("disabled", modRow.modData.isInstalled && !modRow.modData.isEnabled);
		checkbox.disabled = false;
		this.isLoadingMods = false;
	}

	async clickRowInstall(modID, e) {
		if (this.isLoadingMods || this.isPerformingActions) {
			logWarn("Cannot click install / uninstall as mods are currently loading or actions are being performed.");
			return;
		}

		e.stopPropagation();

		// If there is an existing action and it is an install then unqueue it
		if (this.allQueuedActions[modID]) {
			if (this.allQueuedActions[modID].type === "install") {
				this.unqueueAction(modID);
			} else {
				logWarn(`Cannot click install / uninstall for mod '${modID}' as it already has another action.`);
			}
		}

		// Otherwise queue the install action
		else {
			await this.queueMainAction(modID, "install");
		}
	}

	async clickSelectedModMainButton(modID) {
		if (this.isLoadingMods || this.isPerformingActions) {
			logWarn("Cannot click main button as mods are currently loading or actions are being performed.");
			return;
		}

		if (this.selectedMod !== modID) {
			logError("Somethings gone wrong, selected mod does not match the clicked modID.");
			return;
		}

		// if the selected mod is installed then uninstall it, and vice versa
		const modData = this.modRows[modID].modData;
		if (modData.isInstalled) {
			await this.instantMainAction(modID, "uninstall");
		} else {
			await this.instantMainAction(modID, "install");
		}
	}

	forceSetModSchema(modID, schema) {
		if (this.modRows[modID] == null) return;
		this.modRows[modID].modData.info.configSchema = schema;
		if (this.isViewingModConfig && this.selectedMod === modID) {
			logDebug(`Forcing set schema for mod '${modID}'`);
			this.configRenderer.forceSetSchema(schema);
		}
	}

	setLoadButtonText(text) {
		getElement("mods-load-button").innerText = text;
	}

	// ------------ INTERNAL ------------
	// Functions mainly used by MAIN and inside this class

	async _loadInstalledMods() {
		if (!this.isLoadingMods) return;

		// Request the installed mods from the backend
		// They should already be populated from 'find-installed-mods'
		const mods = await api.invoke("fl:get-installed-mods", { rendered: true });

		// Now populate the table with the mods, this table should be empty at this point
		const tbody = getElement("mods-tab-table").querySelector("tbody");
		let newModIDs = [];
		for (const mod of mods) {
			if (this.modRows[mod.info.modID] != null) {
				throw new Error(`Mod ${mod.info.modID} already exists in the mod table, this should not happen.`);
			}

			// Manually filter installed mods based on the search and tags
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

			// Convert them to our modData format
			let modData = this._getBaseModData();
			modData.modID = mod.info.modID;
			modData.info = mod.info;
			modData.votes = null;
			modData.lastUpdated = "local";
			modData.renderedDescription = mod.renderedDescription;
			modData.versions = null;
			modData.isInstalled = true;
			modData.isEnabled = mod.isEnabled;

			this.modRows[modData.modID] = this._createModRow(modData);
			newModIDs.push(modData.modID);
		}

		for (const modID of newModIDs) tbody.appendChild(this.modRows[modID].element);
	}

	async _loadInstalledModsVersions() {
		if (!this.isLoadingMods) return;

		// Request the versions for the installed mods from the backend
		const res = await api.invoke("fl:get-installed-mods-versions");
		if (!res.success) {
			logError("Failed to fetch installed mods versions:", res.error);
			setConnectionState("offline");
			return;
		}
		
		// Update each existing installed mod we got versions for
		const modVersions = res.data;
		for (const modID in modVersions) {
			if (this.modRows[modID] == null) {
				logError(`Mod '${modID}' should exist but it does not.`);
				continue;
			}

			// It is possible that the mod is local only
			if (modVersions[modID] == null || modVersions[modID].length === 0) continue;

			// Update mod row data with new versions
			this.modRows[modID].modData.versions = modVersions[modID];
			const versionsTD = this.modRows[modID].element.querySelector(".mod-row-versions");
			if (versionsTD == null) {
				logError(`Mod row for '${modID}' does not have versions td, cannot update versions.`);
				return;
			}

			// Create the versions element
			const versionElement = this._createModRowVersions(this.modRows[modID].modData);
			element.querySelector(".mod-row-versions").appendChild(versionElement);
		}
	}

	async _loadMoreRemoteMods() {
		if (!this.isLoadingMods) return;

		const getInfo = {
			search: this.filterInfo.search,
			tags: this.filterInfo.tags,
			pageSize: ModsTab.PAGE_SIZE,
			page: this.currentModPage + 1,
			rendered: true,
		};

		// Fetch mods but then apply arbitrary delay to make it not feel too fast
		const startTime = Date.now();
		const res = await api.invoke("fl:fetch-remote-mods", getInfo);
		if (!res.success) {
			logError("Failed to fetch remote mods:", res.error);
			setConnectionState("offline");
			this.isLoadingMods = false;
			return;
		}

		const mods = res.data;
		const endTime = Date.now();
		if (endTime - startTime < DELAY_LOAD_REMOTE_MS) {
			await new Promise((resolve) => setTimeout(resolve, DELAY_LOAD_REMOTE_MS - (endTime - startTime)));
		}

		// Did not receive any mods so presume that we are offline
		if (mods == null || mods == []) {
			logInfo("No remote mods found, setting connection state to offline.");
			setConnectionState("offline");
			this.isLoadingMods = false;
			return;
		}

		// Now populate the table with the remote mods
		const tbody = getElement("mods-tab-table").querySelector("tbody");
		let newModIDs = [];
		for (const mod of mods) {
			// If the mod is already visible then skip it
			if (this.modRows[mod.modID] != null) {
				logDebug(`Skipping already existing mod: ${mod.modID}`);
				continue;
			}

			// Convert into modData format and put into the table
			let modData = this._getBaseModData();
			modData.modID = mod.modID;
			modData.info = mod.modData;
			modData.votes = mod.votes;
			modData.lastUpdated = convertUploadTimeToString(mod.uploadTime);
			modData.renderedDescription = mod.renderedDescription;
			modData.versions = mod.versionNumbers;
			modData.isInstalled = false;
			modData.isEnabled = false;

			this.modRows[modData.modID] = this._createModRow(modData);
			newModIDs.push(modData.modID);
		}

		for (const modID of newModIDs) tbody.appendChild(this.modRows[modID].element);
		this.currentModPage++;
		setConnectionState("online");
	}

	_createModRow(modData) {
		let tagsList = "";
		if (modData.info.tags) tagsList = modData.info.tags.reduce((acc, tag) => acc + `<span class="tag">${tag}</span>`, "");

		const element = createElement(`<tr>
			<td class="mod-row-status"></td>
			<td>${modData.info.name}</td>
			<td>${modData.info.author}</td>
			<td class="mod-row-versions"></td>
			<td>${modData.info.shortDescription || ""}</td>
			<td>${modData.lastUpdated}</td>
			<td class="mods-table-tag-list">${tagsList}</td>
		</tr>`);

		// Select mod on click
		element.addEventListener("click", (e) => this.selectMod(modData.modID));

		// Set initial disabled state
		element.classList.toggle("disabled", modData.isInstalled && !modData.isEnabled);

		// Setup status element
		const statusElement = this._createModRowStatus(modData);
		element.querySelector(".mod-row-status").appendChild(statusElement);

		// Setup version element
		const versionElement = this._createModRowVersions(modData);
		element.querySelector(".mod-row-versions").appendChild(versionElement);

		return { element, modData };
	}

	_updateModRow(modData) {
		if (this.modRows[modData.modID] == null) {
			logError(`Mod row for ${modData.modID} does not exist, cannot update.`);
			return;
		}

		// Create new row element and replace the old one
		const oldElement = this.modRows[modData.modID].element;
		const newRow = this._createModRow(modData);
		oldElement.parentNode.replaceChild(newRow.element, oldElement);

		// Update the modRows map with the new row
		this.modRows[modData.modID].element = newRow.element;
		this.modRows[modData.modID].modData = modData;
	}

	_createModRowStatus(modData) {
		// If installed then create a checkbox for enabling / disabling
		if (modData.isInstalled) {
			const checkboxElement = createElement(`<input type="checkbox" ${modData.isEnabled ? "checked" : ""}>`);
			checkboxElement.addEventListener("click", (e) => e.stopPropagation());
			checkboxElement.addEventListener("change", (e) => this.changeModEnabled(modData.modID, e));
			return checkboxElement;
		}

		// Otherwise create a download icon for installing
		else {
			const downloadElement = createElement(`<img src="assets/download.png" />`);
			downloadElement.addEventListener("click", (e) => this.clickRowInstall(modData.modID, e));
			return downloadElement;
		}
	}

	_createModRowVersions(modData) {
		// If given a single version (or no versions make a span)
		if (modData.versions == null || modData.versions.length === 0) {
			return createElement(`<span>${modData.info.version}</span>`);
		}

		// Otherwise make a dropdown with all versions
		else {
			const versionToOption = (v) => `<option value="${v}" ${v === modData.info.version ? "selected" : ""}>${v}</option>`;
			const dropdown = createElement(`<select>${modData.versions.reduce((acc, v) => acc + versionToOption(v), "")}</select>`);
			dropdown.addEventListener("click", (e) => e.stopPropagation());
			dropdown.addEventListener("change", (e) => this.changeModVersion(modData.modID, e));
			return dropdown;
		}
	}

	_setModButtons(buttons) {
		if (buttons.length == 0) {
			getElement("mod-buttons").style.display = "none";
			return;
		}

		getElement("mod-buttons").style.display = "flex";
		getElement("mod-buttons").innerHTML = "";
		for (let i = 0; i < buttons.length; i++) {
			const button = createElement(`<div class="mod-button"></div>`);
			button.onclick = () => {
				if (buttons[i].toggle) {
					button.classList.toggle("active");
				}
				buttons[i].onClick();
			};
			if (buttons[i].text) {
				const text = createElement(`<span class="mod-button-text">${buttons[i].text}</span>`);
				button.appendChild(text);
			}
			if (buttons[i].icon) {
				const icon = createElement(`<img src="${buttons[i].icon}" class="mod-button-icon">`);
				button.appendChild(icon);
			}
			getElement("mod-buttons").appendChild(button);
		}
	}

	async _setViewingModConfig(enabled) {
		if (this.isViewingModConfig === enabled) return;
		this.isViewingModConfig = enabled;
		const configContainer = getElement("mod-config-container");
		const modInfoContainer = getElement("mod-info-container");

		if (!enabled || this.selectedMod == null || this.modRows[this.selectedMod] == null) {
			this.configRenderer = null;
			configContainer.innerHTML = "";
			configContainer.style.display = "none";
			modInfoContainer.style.display = "block";
			return;
		}

		const modData = this.modRows[this.selectedMod].modData;
		if (!modData.info.configSchema) {
			logWarn(`Mod ${this.selectedMod} does not have a config schema, cannot show config.`);
			return;
		}

		configContainer.style.display = "block";
		modInfoContainer.style.display = "none";
		configContainer.innerHTML = "";

		const config = await api.invoke("fl-mod-config:get", this.selectedMod);
		const schema = modData.info.configSchema;

		this.configRenderer = new ConfigSchemaElement(configContainer, config, schema, async (newConfig) => {
			logDebug(`Mod ${this.selectedMod} config changed, notifying electron...`);
			const success = await api.invoke("fl-mod-config:set", this.selectedMod, newConfig);
			if (!success) {
				logError(`Failed to set config for mod ${this.selectedMod}`);
				setProgressText("Failed to set mod config");
				setProgress(0);
			} else {
				logDebug(`Config for mod ${this.selectedMod} set successfully.`);
				this.modRows[this.selectedMod].modData.info.config = newConfig;
				setProgressText("Mod config updated successfully");
				setProgress(0);
			}
		});
	}

	_getBaseModData() {
		return {
			modID: null,
			info: null,
			votes: null,
			lastUpdated: null,
			renderedDescription: null,
			versions: null,
			isInstalled: false,
			isEnabled: false,
		};
	}

	// ------------ ACTIONS ------------

	toggleActionQueue(visible) {
		if (visible === this.isActionQueueVisible) return;

		if (Object.keys(this.allQueuedActions).length === 0 && visible) return;

		this.isActionQueueVisible = visible;

		const actionQueue = getElement("mods-tab-action-queue");
		actionQueue.classList.toggle("open", visible);

		const hider = actionQueue.querySelector(".hider");
		hider.style.display = visible ? "block" : "none";
	}

	async queueMainAction(modID, type) {
		// TODO: We shouldn't outright block queueing actions if we are already queuing actions
		if (this.isLoadingMods || this.isPerformingActions || this.isQueueingAction) {
			logDebug(`Cannot queue action for mod '${modID}' as we are currently loading mods or performing actions.`);
			return;
		}
		this.isQueueingAction = true;

		// There should not be an existing action for this mod, and the mod should exist
		if (this.mainQueuedActions[modID] != null) {
			logWarn(`Mod '${modID}' already has a queued action.`);
			return;
		}
		if (!this.modRows[modID]) {
			logError(`Mod row for '${modID}' does not exist, cannot queue action.`);
			return;
		}

		// Only allow INSTALL and UNINSTALL actions to be queued through this function
		if (type !== "install" && type !== "uninstall") {
			logError(`Invalid action type '${type}' for mod '${modID}', only 'install' and 'uninstall' are allowed.`);
			return;
		}

		// Make the main action
		const modRow = this.modRows[modID];
		const action = { modID, version: modRow.modData.info.version, type, element: null, parentAction: null, derivedActions: [] };
		this.mainQueuedActions[modID] = action;

		// Ask the backend to figure out all the actions based on the main actions
		const allActions = await api.invoke("fl:calculate-mod-actions", this.mainQueuedActions);
		logDebug(`Queueing action ${type} for mod '${modID}', received ${Object.keys(allActions).length} total actions.`);
		if (!allActions || Object.keys(allActions).length === 0) {
			throw new Error(`Failed to calculate actions for mod '${modID}'`);
		}

		// Remake the full action queue with the new all queued actions
		this.allQueuedActions = allActions;
		const actionQueueContent = getElement("mods-tab-action-queue-content");
		actionQueueContent.innerHTML = "";

		// Create the action elements for each action
		for (const actionID in this.allQueuedActions) {
			const action = this.allQueuedActions[actionID];
			action.element = createElement(`
				<div class="action">
					<span class="action-type">${action.type}</span>
					<span class="action-id">${action.modID}</span>
					<span class="action-data">${action.version}</span>
					<img src="assets/close.png" class="action-remove">
				</div>
			`);
			action.element.addEventListener("click", (e) => {
				e.stopPropagation();
				this.unqueueAction(action.modID);
			});
			actionQueueContent.appendChild(action.element);
			this.modifyActionPreview(action, true);
		}

		this.toggleActionQueue(true);
		this.isQueueingAction = false;
	}

	unqueueAction(modID) {
		if (this.isLoadingMods || this.isPerformingActions || this.isQueueingAction) {
			logDebug(`Cannot unqueue action for mod '${modID}' as we are currently loading mods or performing actions.`);
			return;
		}
		this.isQueueingAction = true;

		const action = this.allQueuedActions[modID];
		if (!action) {
			logWarn(`No queued action for mod '${modID}' to unqueue.`);
			return;
		}

		logDebug(`Unqueuing action for mod '${modID}'`);

		// If it is a child action then just remove the parent action
		if (action.parentAction) {
			logDebug(`Redirecting to remove parent action for mod ${action.parentAction}`);
			this.unqueueAction(action.parentAction);
			return;
		}

		// At this point it must be a main action
		if (!this.mainQueuedActions[modID]) {
			logError(`Expected action for mod '${modID}' to be a main action, but it is not.`);
			this.isQueueingAction = false;
			return;
		}

		logDebug(`Removing main action for mod '${modID}'`);
		this.modifyActionPreview(action, false);
		if (action.element && action.element.parentNode) {
			action.element.parentNode.removeChild(action.element);
		}
		delete this.allQueuedActions[modID];
		delete this.mainQueuedActions[modID];

		// Remove all derived actions
		if (action.derivedActions.length > 0) {
			for (const derivedActionModID of action.derivedActions) {
				const derivedAction = this.allQueuedActions[derivedActionModID];
				logDebug(`Removing derived action for mod ${derivedAction.modID}`);
				this.modifyActionPreview(derivedAction, false);
				if (derivedAction.element && derivedAction.element.parentNode) {
					derivedAction.element.parentNode.removeChild(derivedAction.element);
				}
				delete this.allQueuedActions[derivedAction.modID];
			}
			action.derivedActions = [];
		}

		// Hide the action queue if there are no more actions
		if (Object.keys(this.mainQueuedActions).length === 0) this.toggleActionQueue(false);
		this.isQueueingAction = false;
	}

	async instantMainAction(modID, type) {
		if (this.isLoadingMods || this.isPerformingActions || this.isQueueingAction) {
			logDebug(`Cannot perform instant main action for mod '${modID}' as we are currently loading mods or performing actions.`);
			return;
		}

		logDebug(`Performing instant main action for mod '${modID}' of type ${type}`);

		// Clear the action queue
		this.allQueuedActions = {};
		this.mainQueuedActions = {};
		const actionQueueContent = getElement("mods-tab-action-queue-content");
		actionQueueContent.innerHTML = "";
		this.toggleActionQueue(true);

		// Queue this as a main action
		await this.queueMainAction(modID, type);
		const action = this.allQueuedActions[modID];
		if (!action) {
			logError(`Failed to queue main action for mod '${modID}'`);
			this.isPerformingActions = false;
			return;
		}

		// Perform the queued actions
		await this.performQueuedActions();
	}

	async performQueuedActions() {
		if (this.isLoadingMods || this.isPerformingActions) {
			logDebug("Cannot perform queued actions as we are currently loading mods or performing actions.");
			return;
		}

		this.isPerformingActions = true;
		setProgressText("Performing actions...");
		setProgress(0);
	}

	modifyActionPreview(action, preview) {
		if (action.type == "install") {
			// Highlight / unhighlight the install button
			const installButton = this.modRows[action.modID].element.querySelector(".mod-row-status img");
			if (!installButton) {
				logError(`Mod row for ${action.modID} does not have a status element, cannot modify action preview.`);
				return;
			}
			installButton.classList.toggle("active", preview);
		}
	}

	// ------------ FILTERING ------------

	onSearchChanged() {
		const searchInput = getElement("mods-tab-search").value.toLowerCase();
		this.filterInfo.search = searchInput;
		this.reloadMods();
	}

	onSelectedTagsChanged() {
		// TODO
		this.reloadMods();
	}

	removeFiltering() {
		this.filterInfo.search = null;
		this.filterInfo.tags = [];
		this.reloadMods();
	}
}

class ConfigTab {
	renderer = null;

	async setup() {
		// Load config and schema
		const config = await api.invoke("fl:get-fluxloader-config");
		const configSchema = await api.invoke("fl:get-fluxloader-config-schema");

		// Setup the config schema element
		const mainElement = getElement("config-tab-content").querySelector(".main");
		this.renderer = new ConfigSchemaElement(mainElement, config, configSchema, async (newConfig) => {
			logDebug("Config changed, notifying electron...");
			const success = await api.invoke("fl:set-fluxloader-config", newConfig);
			if (!success) {
				logError("Failed to set config");
				setProgressText("Failed to set config");
				setProgress(0);
			} else {
				logDebug("Config set successfully.");
				setProgressText("Config updated successfully");
				setProgress(0);
			}
		});
	}

	async selectTab() {
		const config = await api.invoke("fl:get-fluxloader-config");
		this.renderer.forceSetConfig(config);
	}

	forceSetConfig(config) {
		this.renderer.forceSetConfig(config);
	}

	forceSetSchema(schema) {
		this.renderer.forceSetSchema(schema);
	}
}

class LogsTab {
	static SOURCE_LOG_LIMIT = 200;
	sources = { manager: {}, electron: {}, game: {} };
	selectedLogSource = null;
	remoteLogIndex = 0;
	isSetup = false;
	isNotifyingError = false;
	errorNotificationElement = null;
	tabContainer = null;
	mainContainer = null;

	async setup() {
		// Clear and setup the elements
		this.tabContainer = getElement("logs-tab-content").querySelector(".logs-tab-list");
		this.mainContainer = getElement("logs-tab-content").querySelector(".logs-content-scroll");
		this.tabContainer.innerHTML = "";
		this.mainContainer.innerHTML = "";

		// Setup error notification element
		const tabElement = getElement("tab-logs");
		this.errorNotificationElement = createElement(`<img class="logs-error-notification" src="assets/cross.png" style="display: none;">`);
		tabElement.appendChild(this.errorNotificationElement);

		for (const source in this.sources) {
			// Create a selectable tab
			const tab = createElement(`
				<div class="option" data-source="${source}">
					<span class="logs-tab-text">${source.charAt(0).toUpperCase() + source.slice(1)}</span>
				</div>`);
			tab.addEventListener("click", () => this.selectLogSource(source));
			this.tabContainer.appendChild(tab);

			// Create a content container
			const content = createElement(`<div class="logs-content" style="display: none;" data-source="${source}"></div>`);
			this.mainContainer.appendChild(content);

			// Initialize the source data
			this.sources[source].logs = [];
			this.sources[source].renderedIndex = -1;
			this.sources[source].tabElement = tab;
			this.sources[source].contentElement = content;
		}

		// Select the default log source
		this.selectLogSource("manager");

		this.isSetup = true;

		// Request the logs that have made up to this point
		const managerLogs = await api.invoke("fl:request-manager-logs");
		tabs.logs.receiveLogs(managerLogs);
	}

	selectTab() {
		this.updateErrorNotification(false);
		this.updateLogView();
	}

	selectLogSource(source) {
		if (this.selectedLogSource === source) return;
		if (!this.sources[source]) {
			logError(`Unknown log source: ${source}`);
			return;
		}

		if (this.selectedLogSource) {
			this.sources[this.selectedLogSource].tabElement.classList.remove("selected");
			this.sources[this.selectedLogSource].contentElement.style.display = "none";
		}

		this.selectedLogSource = source;

		if (this.selectedLogSource) {
			this.sources[this.selectedLogSource].tabElement.classList.add("selected");
			this.sources[this.selectedLogSource].contentElement.style.display = "block";
		}

		this.updateLogView();
	}

	updateLogView() {
		const source = this.selectedLogSource;
		const sourceData = this.sources[source];
		const logs = sourceData.logs;
		const content = sourceData.contentElement;

		// Render up to the newest logs
		for (let i = sourceData.renderedIndex + 1; i < logs.length; i++) {
			const log = logs[i];
			let timestampText = log.timestamp.toISOString().split("T")[1].split("Z")[0];
			const row = createElement(`
				<div class="log-row level-${log.level}">
					<div class="log-timestamp">${timestampText}</div>
					<div class="log-level">${log.level.toUpperCase()}</div>
					${log.tag ? '<div class="log-tag">' + log.tag + "</div>" : ""}
					<div class="log-message">${log.message}</div>
				</div>
			`);
			content.appendChild(row);
		}
		sourceData.renderedIndex = logs.length - 1;

		// Remove old logs if we exceed the limit
		if (logs.length > LogsTab.SOURCE_LOG_LIMIT) {
			const excessCount = logs.length - LogsTab.SOURCE_LOG_LIMIT;
			for (let j = 0; j < excessCount; j++) {
				logs.shift();
				if (!content.firstChild) throw new Error("Trying to trim a log that doesn't exist.");
				content.removeChild(content.firstChild);
				sourceData.renderedIndex--;
			}
		}

		// Scroll to the bottom of the log view
		this.mainContainer.scrollTop = content.scrollHeight - 0.1;
	}

	addLog(log) {
		if (!this.isSetup) {
			console.log("Logs tab not setup yet, cannot add log.");
			return;
		}

		if (!log || !log.timestamp || !log.level || !log.message) {
			logWarn(`Invalid log entry: ${JSON.stringify(log)}`);
			return;
		}

		if (log.level === "error") this.updateErrorNotification(true);

		this.sources[log.source].logs.push(log);

		if (selectedTab == "logs" && this.selectedLogSource === log.source) this.updateLogView();
	}

	receiveLogs(logs) {
		for (let i = this.remoteLogIndex; i < logs.length; i++) this.addLog(logs[i]);
		this.remoteLogIndex = logs.length;
	}

	receiveLog(log) {
		// Have to assume received logs in-order
		this.addLog(log);
		this.remoteLogIndex++;
	}

	updateErrorNotification(toggled) {
		if (selectedTab === "logs" && toggled) return;
		this.isNotifyingError = toggled;
		this.errorNotificationElement.style.display = toggled ? "block" : "none";
	}
}

function setupElectronEvents() {
	api.on("fl:forward-log", (_, log) => {
		tabs.logs.receiveLog(log);
	});

	api.on(`fl:game-closed`, () => {
		if (!isPlaying) return;
		setProgressText("Game closed");
		setProgress(0);
		isPlaying = false;
		updateMainControlButtonText();
		getElement("main-control-button").classList.toggle("active", false);
	});

	api.on("fl:mod-schema-updated", (_, { modID, schema }) => {
		logDebug(`Received schema update for mod '${modID}'`);
		tabs.mods.forceSetModSchema(modID, schema);
	});

	api.on("fl:fluxloader-config-updated", (_, config) => {
		logDebug("Received config update for FluxLoader");
		tabs.config.forceSetConfig(config);
	});
}

async function setupTabs() {
	tabs.logs = new LogsTab();
	tabs.mods = new ModsTab();
	tabs.config = new ConfigTab();

	for (const tab in tabs) {
		getElement(`tab-${tab}`).addEventListener("click", async () => {
			await selectTab(tab);
		});
		if (tabs[tab].setup) await tabs[tab].setup();
	}
}

async function selectTab(tab) {
	if (selectedTab) {
		getElement(`tab-${selectedTab}`).classList.remove("selected");
		getElement(`${selectedTab}-tab-content`).style.display = "none";
		if (tabs[selectedTab].deselectTab) await tabs[selectedTab].deselectTab();
	}

	selectedTab = tab;

	getElement(`tab-${tab}`).classList.add("selected");
	getElement(`${tab}-tab-content`).style.display = "block";
	if (tabs[tab].selectTab) await tabs[tab].selectTab();
}

async function togglePlaying() {
	setProgressText("Loading...");
	setProgress(0);

	if (!isPlaying) {
		const res = await api.invoke(`fl:start-game`);
		if (!res.success) {
			logError("Failed to start the game, please check the logs for more details.");
			setProgressText("Failed to start game");
		} else {
			setProgressText("Game started");
		}
		setProgress(0);
		getElement("main-control-button").classList.toggle("active", res.success);
		isPlaying = res.success;
		isMainControlButtonLoading = false;
		updateMainControlButtonText();
	} else {
		await api.invoke(`fl:close-game`);
		setProgressText("Game stopped");
		setProgress(0);
		getElement("main-control-button").classList.toggle("active", false);
		isMainControlButtonLoading = false;
		isPlaying = false;
		updateMainControlButtonText();
	}
}

function setProgressText(text) {
	getElement("progress-bar-text").innerText = text;
}

function setProgress(percent) {
	getElement("progress-bar").style.width = `${percent}%`;
}

function setConnectionState(state) {
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
	connectionState = state;
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

	if (tabs.mods.isLoadingMods) {
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

function setFullscreenAlert(text, buttons) {
	const alertElement = getElement("fullscreen-alert");

	alertElement.querySelector(".alert-text").innerText = text;

	const buttonContainer = alertElement.querySelector(".alert-buttons");
	buttonContainer.innerHTML = "";

	buttons.forEach((button) => {
		const buttonElement = createElement(`<button class="alert-button">${button.text}</button>`);
		buttonElement.addEventListener("click", () => {
			button.onClick();
			alertElement.style.display = "none";
		});
		buttonContainer.appendChild(buttonElement);
	});

	alertElement.style.display = "flex";
}

// =================== DRIVER ===================

(async () => {
	await setupTabs();
	setupElectronEvents();

	getElement("main-control-button").addEventListener("click", () => handleClickMainControlButton());

	document.querySelectorAll(".resizer").forEach(handleResizer);

	setProgressText("");
	setProgress(0);
	selectTab("mods");

	logDebug("FluxLoader Manager started.");
})();
