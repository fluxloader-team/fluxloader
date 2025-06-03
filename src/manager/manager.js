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
	queuedActions = [];
	hasLoadedOnce = false;
	isViewingModConfig = false;
	isLoadingMods = false;
	isActionQueueOpen = false;
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
			this.toggleActionQueue();
		});

		getElement("refresh-mods").addEventListener("click", async () => {
			await reloadMods();
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

	async reloadMods() {
		if (this.isLoadingMods) return;
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
		await api.invoke("fl:find-installed-mods");
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
		setProgressText("Reloaded mods.");
	}

	async loadMoreMods() {
		if (this.isLoadingMods) return;
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
		setProgressText("Loaded mods.");
		setProgress(100);
	}

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
			let modData = {
				modID: mod.info.modID,
				info: mod.info,
				votes: null,
				lastUpdated: "",
				renderedDescription: mod.renderedDescription,
				version: null,
				isLocal: true,
				isInstalled: true,
				isLoaded: mod.isLoaded,
				isEnabled: mod.isEnabled,
			};

			this.modRows[modData.modID] = this.createModRow(modData);
			newModIDs.push(modData.modID);
		}

		for (const modID of newModIDs) tbody.appendChild(this.modRows[modID].element);
	}

	async _loadInstalledModsVersions() {
		if (!this.isLoadingMods) return;

		// Request the versions for the installed mods from the backend
		const mods = await api.invoke("fl:get-installed-mods-versions");

		// Update each existing installed mod we got versions for
		for (const mod of mods) {
			if (this.modRows[mod.modID] == null) {
				logError(`Mod ${mod.modID} should exist but it does not.`);
				continue;
			}

			// It is possible that the mod is local only
			if (mod.versions == null || mod.versions.length === 0) continue;

			// Update mod row data with new versions
			this.modRows[mod.modID].modData.versions = mod.versions;
			const versionsTD = this.modRows[mod.modID].element.querySelector(".mod-row-versions");
			if (versionsTD == null) {
				logError(`Mod row for ${mod.modID} does not have versions td, cannot update versions.`);
				return;
			}
			versionsTD.innerHTML = this._createModRowVersions(this.modRows[mod.modID].modData);
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
		const mods = await api.invoke("fl:fetch-remote-mods", getInfo);
		const endTime = Date.now();
		if (endTime - startTime < DELAY_LOAD_REMOTE_MS) {
			await new Promise((resolve) => setTimeout(resolve, DELAY_LOAD_REMOTE_MS - (endTime - startTime)));
		}

		// Did not receive any mods so presume that we are offline
		if (mods == null || mods == []) {
			this.setLoadButtonText("Load mods");
			setConnectionState("offline");
			setProgressText("No remote mods available.");
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
			let modData = {
				modID: mod.modID,
				info: mod.modData,
				votes: mod.votes,
				lastUpdated: convertUploadTimeToString(mod.uploadTime),
				renderedDescription: mod.renderedDescription,
				versions: mod.versionNumbers,
				isLocal: false,
				isInstalled: false,
				isLoaded: false,
				isEnabled: false,
			};

			this.modRows[modData.modID] = this.createModRow(modData);
			newModIDs.push(modData.modID);
		}
		for (const modID of newModIDs) tbody.appendChild(this.modRows[modID].element);
		this.currentModPage++;
	}

	createModRow(modData) {
		const element = createElement(
			`<tr>
				<td>
				` +
				(modData.isInstalled ? `<input type="checkbox" ${modData.isEnabled ? "checked" : ""}>` : ``) +
				`</td>
				<td>${modData.info.name}</td>
				<td>${modData.info.author}</td>
				<td class="mod-row-versions">${this._createModRowVersions(modData)}</td>
				<td>${modData.info.shortDescription || ""}</td>
				<td>${modData.lastUpdated}</td>
				<td class="mods-tab-table-tag-list">
				${
					modData.info.tags
						? modData.info.tags.reduce((acc, tag) => {
								return acc + `<span class="tag">${tag}</span>`;
						  }, "")
						: ""
				}
				</td>
			</tr>`
		);

		element.classList.toggle("disabled", modData.isInstalled && !modData.isEnabled);
		element.addEventListener("click", (e) => this.selectMod(modData.modID));

		// Listen to the checkbox for enabling / disabling mods
		if (modData.isInstalled) {
			const checkbox = element.querySelector("input[type='checkbox']");
			checkbox.addEventListener("click", (e) => e.stopPropagation());
			checkbox.addEventListener("change", (e) => {
				const checkbox = e.target;
				const isChecked = checkbox.checked;
				checkbox.disabled = true;
				api.invoke("fl:set-mod-enabled", { modID: modData.modID, enabled: isChecked }).then((success) => {
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

	_createModRowVersions(modData) {
		if (modData.versions == null || modData.versions.length === 0) {
			return `<span>${modData.info.version}</span>`;
		} else {
			return `
				<select>
					${modData.versions.reduce((acc, version) => {
						return acc + `<option value="${version}" ${version === modData.info.version ? "selected" : ""}>${version}</option>`;
					}, "")}
				</select>`;
		}
	}

	// ------------ MAIN ------------

	async selectMod(modID) {
		await this.setViewingModConfig(false);

		// Deselect a mod and remove all mod info
		if (this.selectedMod !== null) {
			this.modRows[this.selectedMod].element.classList.remove("selected");
			if (this.selectedMod === modID) {
				getElement("mod-info-title").innerText = "Mod Name";
				getElement("mod-info").style.display = "none";
				getElement("mod-info-empty").style.display = "block";
				this.setModButtons([]);
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
				buttons.push({ text: "Uninstall", onClick: () => this.queueUninstall(modData.modID) });
				if (modData.info.configSchema) {
					buttons.push({ icon: "assets/config.png", onClick: () => this.setViewingModConfig(!this.isViewingModConfig), toggle: true });
				}
			} else {
				buttons.push({ text: "Install", onClick: () => this.queueInstall(modData.modID, modData.info.version) });
			}
			this.setModButtons(buttons);
		}
	}

	setModButtons(buttons) {
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

	setLoadButtonText(text) {
		getElement("mods-load-button").innerText = text;
	}

	async setViewingModConfig(enabled) {
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
			logInfo(`Mod ${this.selectedMod} config changed, notifying electron...`);
			const success = await api.invoke("fl-mod-config:set", this.selectedMod, newConfig);
			if (!success) {
				logError(`Failed to set config for mod ${this.selectedMod}`);
				setProgressText("Failed to set mod config.");
				setProgress(0);
			} else {
				logInfo(`Config for mod ${this.selectedMod} set successfully.`);
				this.modRows[this.selectedMod].modData.info.config = newConfig;
				setProgressText("Mod config updated successfully.");
				setProgress(0);
			}
		});
	}

	forceSetModSchema(modID, schema) {
		if (this.modRows[modID] == null) return;
		this.modRows[modID].modData.info.configSchema = schema;
		if (this.isViewingModConfig && this.selectedMod === modID) {
			logInfo(`Forcing set schema for mod ${modID}`);
			this.configRenderer.forceSetSchema(schema);
		}
	}

	// ------------ ACTIONS ------------

	toggleActionQueue() {
		this.isActionQueueOpen = !this.isActionQueueOpen;
		const actionQueue = getElement("mods-tab-action-queue");
		const hider = actionQueue.querySelector(".hider");
		hider.style.display = this.isActionQueueOpen ? "block" : "none";
		actionQueue.classList.toggle("open", this.isActionQueueOpen);
	}

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
			logInfo("Config changed, notifying electron...");
			const success = await api.invoke("fl:set-fluxloader-config", newConfig);
			if (!success) {
				logError("Failed to set config");
				setProgressText("Failed to set config.");
				setProgress(0);
			} else {
				logInfo("Config set successfully.");
				setProgressText("Config updated successfully.");
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
		setProgressText("Game closed.");
		setProgress(0);
		isPlaying = false;
		updateMainControlButtonText();
		getElement("main-control-button").classList.toggle("active", false);
	});

	api.on("fl:mod-schema-updated", (_, { modID, schema }) => {
		logInfo(`Received schema update for mod ${modID}`);
		tabs.mods.forceSetModSchema(modID, schema);
	});

	api.on("fl:fluxloader-config-updated", (_, config) => {
		logInfo("Received config update for FluxLoader");
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
		await api.invoke(`fl:start-game`);
		setProgressText("Game started.");
		setProgress(100);
		isMainControlButtonLoading = false;
		isPlaying = true;
		updateMainControlButtonText();
		getElement("main-control-button").classList.toggle("active", true);
	} else {
		await api.invoke(`fl:stop-game`);
		setProgressText("Game stopped.");
		setProgress(0);
		isMainControlButtonLoading = false;
		isPlaying = false;
		updateMainControlButtonText("Start");
		getElement("main-control-button").classList.toggle("active", false);
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

// =================== DRIVER ===================

(async () => {
	await setupTabs();
	setupElectronEvents();

	getElement("main-control-button").addEventListener("click", () => handleClickMainControlButton());

	document.querySelectorAll(".resizer").forEach(handleResizer);

	setProgressText("");
	setProgress(0);
	selectTab("mods");

	logInfo("FluxLoader Manager started.");
})();
