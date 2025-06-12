import { SchemaValidation, Logging } from "../common.js";
globalThis.semver = api.semver;

// =================== VARIABLES ===================

const DELAY_LOAD_REMOTE_MS = 150;
const DELAY_RELOAD_MS = 150;

globalThis.tabs = { mods: null, config: null, logs: null };
let selectedTab = null;
let getElementMemoization = {};

// The following are blocking and should block other tasks
// When they are changed use addBlockingTask() & removeBlockingTask()
// When you try to do a blocked action use pingBlockingTask()
let blockingTasks = new Set();
let isPlaying = false;
let isPlayButtonLoading = false;
let isFullscreenAlertVisible = false;
// tabs.isLoadingMods
// tabs.isQueueingActions
// tabs.isPerformingActions
let connectionState = "offline";

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

class ConfigSchemaElement {
	parentElement = null;
	containerElement = null;
	contentElement = null;
	config = null;
	schema = null;
	onChange = null;
	extraValidation = null;
	statusElements = { wrapper: null, text: null, image: null };
	schemaError = null;
	inputErrors = new Map();
	inputs = new Map();

	constructor(parentElement, config, schema, onChange, extraValidation = null) {
		// Initialize variables
		this.parentElement = parentElement;
		this.containerElement = null;
		this.contentElement = null;
		this.config = JSON.parse(JSON.stringify(config));
		this.schema = schema;
		this.onChange = onChange;
		this.extraValidation = extraValidation;
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
		this.statusElements.image.src = "assets/reload.png";
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
		this.inputErrors.clear();
		this.schemaError = null;
		this._createSchemaSection(this.config, this.schema, this.contentElement, []);
		this._updateStatus();
	}

	rerenderAsInvalidSchema(error) {
		this.contentElement.innerHTML = "";
		this.inputs.clear();
		this.inputErrors.clear();
		this.schemaError = error;
		this._updateStatus();
	}

	// ------------ INTERNAL ------------

	_createSchemaSection(configSection, schemaSection, container, path) {
		// Mirrors the recursive search in the SchemaValidation.validate()
		// Search over all the properties of the current schema section level
		for (const [key, schemaValue] of Object.entries(schemaSection)) {
			const currentPath = [...path, key];

			// If it is not a leaf node then recurse into a new section
			const res = SchemaValidation.isSchemaLeafNode(schemaValue);
			if (!res.success) {
				this.rerenderAsInvalidSchema(res.error);
				return false;
			}
			if (!res.isLeaf) {
				const sectionContainer = document.createElement("div");
				sectionContainer.classList.add("config-section");
				const sectionTitle = document.createElement("h3");
				sectionTitle.classList.add("config-section-title");
				sectionTitle.textContent = key;
				sectionContainer.appendChild(sectionTitle);
				container.appendChild(sectionContainer);

				// Recurse into the next level
				if (!this._createSchemaSection(configSection?.[key] ?? {}, schemaValue, sectionContainer, currentPath)) return false;
			}

			// Otherwise we want to render this leaf as an input
			else {
				if (schemaValue.hidden && schemaValue.hidden === true) {
					continue;
				}

				// Create the input element based on the schema type
				let value = configSection?.[key] ?? schemaValue.default;
				if (!value) value = "";
				let input;
				switch (schemaValue.type) {
					case "string":
						input = document.createElement("input");
						input.type = "text";
						input.value = value;
						break;

					case "semver":
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

				this.inputs.set(currentPath.join("."), input);
				input.addEventListener("change", () => this._validateInput(currentPath, input, schemaValue));
				this._validateInput(currentPath, input, schemaValue, false);
			}
		}

		return true;
	}

	_validateInput(path, input, schemaValue, emitOnChange = true) {
		let isValid = true;
		let error = { source: "unknown", error: "" };

		// Parse the value out of the input
		let value;
		try {
			if (schemaValue.type === "boolean") value = input.checked;
			else if (schemaValue.type === "number") value = parseFloat(input.value);
			else value = input.value;
		} catch (e) {
			isValid = false;
			error.source = "input";
			error.message = `Invalid value: ${e.message}`;
		}

		// Then validate it using the schema
		const pathKey = path.join(".");
		if (isValid) {
			const res = SchemaValidation.validateValue(value, schemaValue);
			if (!res.success) {
				isValid = false;
				error.source = res.source;
				error.message = `${pathKey} is invalid: ${res.error}`;
			}
		}

		// Then validate it with user provided extra validation
		if (isValid && this.extraValidation) {
			const extraValidationRes = this.extraValidation(value, schemaValue);
			if (!extraValidationRes.success) {
				isValid = false;
				error.source = extraValidationRes.source;
				error.message = extraValidationRes.error;
			}
		}

		if (isValid) {
			input.classList.remove("invalid");
			this.inputErrors.delete(pathKey);
			this._setConfigValue(path, value);
			if (emitOnChange) this.onChange(this.config);
		} else {
			input.classList.add("invalid");
			this.inputErrors.set(pathKey, error);
		}
		this._updateStatus();
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

	_updateStatus() {
		if (this.schemaError != null) {
			this.statusElements.wrapper.classList.add("invalid");
			this.statusElements.wrapper.classList.remove("valid");
			this.statusElements.text.textContent = `Schema is invalid: ${this.schemaError}`;
			this.statusElements.image.src = "assets/cross.png";
			return;
		}

		if (this.inputErrors.size > 0) {
			this.statusElements.wrapper.classList.add("invalid");
			this.statusElements.wrapper.classList.remove("valid");
			let firstError = this.inputErrors.values().next().value;
			this.statusElements.text.textContent = firstError.message;
			if (this.inputErrors.size > 1) {
				this.statusElements.text.textContent += ` (${this.inputErrors.size} errors)`;
			}
			this.statusElements.image.src = "assets/cross.png";
			return;
		}

		this.statusElements.wrapper.classList.remove("invalid");
		this.statusElements.wrapper.classList.add("valid");
		const now = new Date();
		this.statusElements.text.textContent = "Config is valid (" + now.toLocaleTimeString() + ")";
		this.statusElements.image.src = "assets/check.png";
	}
}

// =================== TABS ===================

class ModsTab {
	static PAGE_SIZE = 200;

	columns = {};
	currentModPage = 0;
	modRows = {};
	selectedMod = null;
	modButtons = [];
	filterInfo = { search: null, tags: [] };
	mainQueuedActions = {};
	allQueuedActions = {};
	hasLoadedOnce = false;
	isViewingModConfig = false;
	isActionQueueVisible = false;
	isActionQueueLoading = false;
	actionQueueQueue = [];
	isLoadingMods = false; // Blocking
	isQueueingAction = false; // Blocking
	isPerformingActions = false; // Blocking

	// ------------ SETUP ------------

	setup() {
		api.on("fl:mod-schema-updated", (_, { modID, schema }) => {
			logDebug(`Received schema update for mod '${modID}'`);
			this.forceSetModSchema(modID, schema);
		});

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

		getElement("action-queue-selection").addEventListener("click", () => {
			this.setActionQueueVisible(!this.isActionQueueVisible);
		});

		getElement("reload-mods").addEventListener("click", async () => {
			await this.reloadMods();
		});

		getElement("mods-load-button").addEventListener("click", async () => {
			await this.loadMoreMods();
		});

		getElement("action-execute-button").addEventListener("click", async () => {
			await this.performQueuedActions();
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
	// Functions used by internal events or from outside this class

	async reloadMods() {
		if (this.isLoadingMods || this.isPerformingActions) return pingBlockingTask("Cannot reload mods while loading or performing actions.");
		this.setIsLoadingMods(true);
		setStatusBar("Reloading all mods...", 0, "loading");
		getElement("reload-mods").classList.add("loading");

		// We want to fully reload the entire mod table
		// This means first updating and fetching the installed mods
		// Then fetching all remote mods

		// Tell the backend to re-discover installed mods
		const res = await api.invoke("fl:reload-installed-mods");
		if (!res.success) {
			logError("Failed to find installed mods:", res.data);
			setStatusBar("Failed to find installed mods", 0, "loading");
			this.setIsLoadingMods(false);
			getElement("reload-mods").classList.remove("loading");
			return;
		}

		// Fetch the installed mods with an arbitrary delay
		const reloadStartTime = Date.now();
		await this.loadInstalledMods(true);
		const reloadEndTime = Date.now();
		if (reloadEndTime - reloadStartTime < DELAY_RELOAD_MS) {
			await new Promise((resolve) => setTimeout(resolve, DELAY_RELOAD_MS - (reloadEndTime - reloadStartTime)));
		}

		// If we are connected then fetch remote mods
		if (connectionState === "online") await this.loadMoreRemoteMods();

		// If we are selecting a mod then make sure to reselect it
		if (this.selectedMod != null) {
			if (this.modRows[this.selectedMod] != null) {
				const oldSelectedMod = this.selectedMod;
				this.selectedMod = null;
				this.selectMod(oldSelectedMod);
			} else {
				this.selectMod(null);
			}
		}

		this.setIsLoadingMods(false);
		setStatusBar("Reloaded mods", 0, "success");
		getElement("reload-mods").classList.remove("loading");
	}

	async loadMoreMods() {
		if (this.isLoadingMods || this.isPerformingActions) return pingBlockingTask("Cannot load more mods while loading or performing actions.");

		// This function makes you go online if you are offline
		if (connectionState === "offline") {
			setConnectionState("connecting");
			await this.loadInstalledModsVersions();
		}

		this.setIsLoadingMods(true);
		setStatusBar("Loading more mods...", 0, "loading");

		await this.loadMoreRemoteMods();

		this.setIsLoadingMods(false);
		setStatusBar("Loaded mods", 0, "success");
	}

	async selectMod(modID) {
		await this.setViewingModConfig(false);

		// Deselect a mod and remove all mod info
		if (this.selectedMod !== null) {
			if (this.modRows[this.selectedMod] != null) {
				this.modRows[this.selectedMod].element.classList.remove("selected");
			}

			getElement("mod-info-title").innerText = "Mod Name";
			getElement("mod-info").style.display = "none";
			getElement("mod-info-empty").style.display = "block";
			this.setModButtons([]);

			if (this.selectedMod === modID) {
				this.selectedMod = null;
				return;
			}
		}

		// Select a mod and show its info
		if (modID != null) {
			if (this.modRows[modID] == null) return logError(`Cannot select mod '${modID}' as it does not exist in the mod table`);
			this.selectedMod = modID;
			this.modRows[modID].element.classList.add("selected");
			const modData = this.modRows[modID].modData;

			// Update title
			getElement("mod-info-title").innerText = modData.info.name;

			// Update the mod info section
			getElement("mod-info").style.display = "block";
			getElement("mod-info-empty").style.display = "none";

			// Update the mod info fields
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

			// Show rendered description
			if (modData.renderedDescription) {
				getElement("mod-info-description").classList.remove("empty");
				modData.renderedDescription = modData.renderedDescription.replace(/<a /g, '<a target="_blank" ');
				getElement("mod-info-description").innerHTML = modData.renderedDescription;
			} else {
				getElement("mod-info-description").classList.add("empty");
				getElement("mod-info-description").innerText = "No description provided.";
			}

			// Show dependencies
			const dependenciesList = getElement("mod-info-dependency-list");
			dependenciesList.innerHTML = "";
			if (modData.info.dependencies && Object.keys(modData.info.dependencies).length > 0) {
				dependenciesList.classList.remove("empty");
				for (const [depModID, depVersion] of Object.entries(modData.info.dependencies)) {
					const depElement = createElement(`<div class="dependency-list-row">
						<img class="dependency-img" src="assets/sublist.png" />
						<span class="dependency-mod-id">${depModID}</span>
						<span class="dependency-mod-version">${depVersion}</span>
					</div>`);
					dependenciesList.appendChild(depElement);
				}
			} else {
				dependenciesList.classList.add("empty");
				dependenciesList.innerText = "No dependencies provided.";
			}

			// Update the mod info buttons
			let buttons = [];
			if (modData.isInstalled) {
				buttons.push({ text: "Uninstall", onClick: () => this.clickSelectedModMainButton(modData.modID) });
				if (modData.info.configSchema && Object.keys(modData.info.configSchema).length > 0) {
					buttons.push({ icon: "assets/config.png", onClick: () => this.setViewingModConfig(!this.isViewingModConfig), toggle: true });
				}
			} else {
				buttons.push({ text: "Install", onClick: () => this.clickSelectedModMainButton(modData.modID) });
			}
			this.setModButtons(buttons);
		}
	}

	async changeModVersion(modID, e) {
		// Allow it to immediately change to the new version
		const wantedVersion = e.target.value;
		const previousVersion = this.modRows[modID].modData.info.version;
		e.preventDefault();

		if (this.isLoadingMods || this.isPerformingActions) {
			e.target.value = previousVersion;
			return pingBlockingTask("Cannot change mod version as mods are currently loading or actions are being performed.");
		}

		if (!this.modRows[modID]) {
			e.target.value = previousVersion;
			logError(`Mod row for '${modID}' does not exist, cannot change version`);
			this.setIsLoadingMods(false);
			return;
		}

		setStatusBar(`Changing mod '${modID}' version to ${wantedVersion}...`, 0, "loading");
		this.setIsLoadingMods(true);

		// Fetch version of a mod
		logDebug(`Changing mod '${modID}' version to ${wantedVersion}`);
		const res = await api.invoke("fl:get-mod-version", { modID, version: wantedVersion, rendered: true });
		if (!res.success) {
			e.target.value = previousVersion;
			logError(`Failed to change mod '${modID}' version to ${wantedVersion}`);
			setStatusBar("Failed to change mod version", 0, "error");
			this.setIsLoadingMods(false);
			return;
		}

		// Convert mod into modData format and update mod row
		let modData;
		if (res.data.isInstalled) {
			modData = this.convertInstalledModToModData(res.data);
		} else {
			modData = this.convertRemoteModToModData(res.data);
		}
		modData.versions = this.modRows[modID].modData.versions; // The versions have not changed (and also not returned here)
		this.updateModRow(modData);

		// Reselect the mod so that mod info is updated
		if (this.selectedMod === modID) {
			this.selectedMod = null;
			this.selectMod(modID);
		}

		this.setIsLoadingMods(false);
		setStatusBar(`Changed mod '${modID}' version to ${wantedVersion}`, 0, "success");
	}

	async changeModEnabled(modID, e) {
		// Grab the value and block anything further
		const checkbox = e.target;
		const previousEnabled = !checkbox.checked;
		const wantedEnabled = checkbox.checked;
		checkbox.checked = previousEnabled;
		checkbox.disabled = true;

		if (this.isLoadingMods || this.isPerformingActions) pingBlockingTask("Cannot change mod enabled state as mods are currently loading or actions are being performed.");
		this.setIsPerformingActions(true);

		// Request backend to change the mod enabled state
		const res = await api.invoke("fl:set-mod-enabled", { modID, enabled: wantedEnabled });
		const modRow = this.modRows[modID];
		if (!res.success) {
			setStatusBar(`Failed to change mod '${modID}' enabled state`, 0, "error");
			modRow.modData.isEnabled = previousEnabled;
			checkbox.checked = previousEnabled;
		} else {
			modRow.modData.isEnabled = wantedEnabled;
			checkbox.checked = wantedEnabled;
		}
		modRow.element.classList.toggle("disabled", modRow.modData.isInstalled && !modRow.modData.isEnabled);
		checkbox.disabled = false;
		this.setIsPerformingActions(false);
	}

	async clickRowInstall(modID, e) {
		if (this.isLoadingMods || this.isPerformingActions) {
			logWarn("Cannot click install / uninstall as mods are currently loading or actions are being performed.");
			return;
		}

		e.stopPropagation();

		// If there is an existing action and it is an install then unqueue it
		this._clearCompletedActions();
		if (this.allQueuedActions[modID]) {
			if (this.allQueuedActions[modID].type === "install") {
				await this.unqueueAction(modID);
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
		if (this.isLoadingMods || this.isPerformingActions) return pingBlockingTask("Cannot click main button as mods are currently loading or actions are being performed.");

		if (this.selectedMod !== modID) {
			logError("Somethings gone wrong, selected mod does not match the clicked modID");
			return;
		}

		// if the selected mod is installed then uninstall it, and vice versa
		const modData = this.modRows[modID].modData;
		if (modData.isInstalled) {
			setFullscreenAlert("Uninstalling mod", `Are you sure you want to uninstall mod '${modData.info.name}'?`, [
				{
					text: "Uninstall",
					onClick: async () => {
						this.modButtons[0].element.classList.add("active");
						this.modButtons[0].element.classList.add("block-cursor");
						await this.instantMainAction(modID, "uninstall");
						this.modButtons[0].element.classList.remove("active");
						this.modButtons[0].element.classList.remove("block-cursor");
					},
				},
				{
					text: "Cancel",
					onClick: () => {},
				},
			]);
		} else {
			this.modButtons[0].element.classList.add("active");
			this.modButtons[0].element.classList.add("block-cursor");
			await this.instantMainAction(modID, "install");
			this.modButtons[0].element.classList.remove("active");
			this.modButtons[0].element.classList.remove("block-cursor");
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

	async loadInstalledModsVersions() {
		if (this.isLoadingMods || this.isPerformingActions) return pingBlockingTask("Cannot load installed mods versions as mods are currently loading or actions are being performed.");
		this.setIsLoadingMods(true);

		// Request the versions for the installed mods from the backend
		const res = await api.invoke("fl:get-installed-mods-versions");
		if (!res.success) {
			logError("Failed to fetch installed mods versions:" + res.data);
			setConnectionState("offline");
			return;
		}

		// Update each existing installed mod we got versions for
		const modVersions = res.data;
		for (const modID in modVersions) {
			if (this.modRows[modID] == null) {
				logError(`Mod '${modID}' should exist but it does not`);
				continue;
			}

			logDebug(`Updating mod '${modID}' versions with ${modVersions[modID].length} versions`);

			// It is possible that the mod is local only
			if (modVersions[modID] == null || modVersions[modID].length === 0) continue;

			// Update mod row data with new versions
			this.modRows[modID].modData.versions = modVersions[modID];
			const versionsTD = this.modRows[modID].element.querySelector(".mod-row-versions");
			if (versionsTD == null) {
				logError(`Mod row for '${modID}' does not have versions td, cannot update versions`);
				return;
			}

			// Create the versions element
			versionsTD.innerHTML = "";
			const versionElement = this._createModRowVersions(this.modRows[modID].modData);
			versionsTD.appendChild(versionElement);
		}

		this.setIsLoadingMods(false);
	}

	// ------------ INTERNAL ------------
	// Functions mainly used by MAIN functions inside this class

	async loadInstalledMods(clearTable = true) {
		if (!this.isLoadingMods) return logError("Cannot load installed mods as isLoadingMods is false, this should not happen");

		// Request the installed mods from the backend
		// They should already be populated from 'reload-installed-mods'
		const mods = await api.invoke("fl:get-installed-mods", { rendered: true });

		// If told to clear the table then do so now
		// Doing it here minimizes the flicker rather than doing it inside reloadMods()
		const tbody = getElement("mods-tab-table").querySelector("tbody");
		getElement("mods-tab-table-empty").style.display = "block";
		if (clearTable) {
			tbody.innerHTML = "";
			this.modRows = {};
			this.currentModPage = 0;
		}

		// If we are connected then also load mod versions
		let versions = {};
		if (connectionState === "online") {
			const res = await api.invoke("fl:get-installed-mods-versions");
			if (!res.success) {
				logError("Failed to fetch installed mods versions:" + res.data);
				setConnectionState("offline");
				versions = {};
			} else {
				logDebug(`Fetched ${Object.keys(res.data).length} installed mod versions`);
				versions = res.data;
			}
		}

		// Now populate the table with the mods, this table should be empty at this point
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

			// Convert to mod data and save
			const modData = this.convertInstalledModToModData(mod);
			if (versions[modData.modID] != null) modData.versions = versions[modData.modID];
			this.modRows[modData.modID] = this.createModRow(modData);
			newModIDs.push(modData.modID);
		}

		for (const modID of newModIDs) tbody.appendChild(this.modRows[modID].element);
		if (newModIDs.length > 0) getElement("mods-tab-table-empty").style.display = "none";
	}

	async loadMoreRemoteMods() {
		if (!this.isLoadingMods) return logError("Cannot load more remote mods as isLoadingMods is false, this should not happen");

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
			logError("Failed to fetch remote mods:" + res.error);
			setConnectionState("offline");
			this.setIsLoadingMods(false);
			return;
		}

		const mods = res.data;
		const endTime = Date.now();
		if (endTime - startTime < DELAY_LOAD_REMOTE_MS) {
			await new Promise((resolve) => setTimeout(resolve, DELAY_LOAD_REMOTE_MS - (endTime - startTime)));
		}

		// Did not receive any mods so presume that we are offline
		if (mods == null || mods == []) {
			logDebug("No remote mods found.");
			this.setIsLoadingMods(false);
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
			const modData = this.convertRemoteModToModData(mod);
			this.modRows[modData.modID] = this.createModRow(modData);
			newModIDs.push(modData.modID);
		}

		for (const modID of newModIDs) tbody.appendChild(this.modRows[modID].element);
		if (newModIDs.length > 0) getElement("mods-tab-table-empty").style.display = "none";
		this.currentModPage++;
		setConnectionState("online");
	}

	createModRow(modData) {
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

	updateModRow(modData) {
		if (this.modRows[modData.modID] == null) {
			logError(`Mod row for ${modData.modID} does not exist, cannot update`);
			return;
		}

		// Create new row element and replace the old one
		const oldElement = this.modRows[modData.modID].element;
		const newRow = this.createModRow(modData);
		oldElement.parentNode.replaceChild(newRow.element, oldElement);

		// Update the modRows map with the new row
		this.modRows[modData.modID].element = newRow.element;
		this.modRows[modData.modID].modData = modData;

		// Make sure the hover status matches the old one
		// TODO: Fix this so it properly reflects action queue state
		let oldStatusHoverElement = oldElement.querySelector(".mod-row-status .hover-img");
		let newStatusHoverElement = newRow.element.querySelector(".mod-row-status .hover-img");
		if (oldStatusHoverElement && newStatusHoverElement) newStatusHoverElement.src = oldStatusHoverElement.src;
		const oldStatusMainElement = oldElement.querySelector(".mod-row-status .main-img");
		const newStatusMainElement = newRow.element.querySelector(".mod-row-status .main-img");
		if (oldStatusMainElement && newStatusMainElement) newStatusMainElement.classList.toggle("acitive", oldStatusMainElement.classList.contains("active"));
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
			const downloadElement = createElement(`<img class="main-img" src="assets/download.png" />`);
			downloadElement.addEventListener("click", (e) => this.clickRowInstall(modData.modID, e));

			const hoverElement = createElement(`<img class="hover-img" src="assets/install.png" />`);

			const containerElement = document.createElement("div");
			containerElement.appendChild(downloadElement);
			containerElement.appendChild(hoverElement);
			return containerElement;
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

	setModButtons(buttons) {
		if (buttons.length == 0) {
			getElement("mod-buttons").style.display = "none";
			return;
		}

		this.modButtons = buttons;
		getElement("mod-buttons").style.display = "flex";
		getElement("mod-buttons").innerHTML = "";

		for (let i = 0; i < this.modButtons.length; i++) {
			const buttonElement = createElement(`<div class="mod-button"></div>`);
			this.modButtons[i].element = buttonElement;
			buttonElement.onclick = () => buttons[i].onClick();
			if (buttons[i].text) {
				const text = createElement(`<span class="mod-button-text">${buttons[i].text}</span>`);
				buttonElement.appendChild(text);
			}
			if (buttons[i].icon) {
				const icon = createElement(`<img src="${buttons[i].icon}" class="mod-button-icon">`);
				buttonElement.appendChild(icon);
			}
			getElement("mod-buttons").appendChild(buttonElement);
		}
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
			logDebug(`Mod ${this.selectedMod} config changed, notifying electron...`);
			const success = await api.invoke("fl-mod-config:set", this.selectedMod, newConfig);
			if (!success) {
				logError(`Failed to set config for mod ${this.selectedMod}`);
				setStatusBar("Failed to set mod config", 0, "error");
			} else {
				logDebug(`Config for mod ${this.selectedMod} set successfully`);
				this.modRows[this.selectedMod].modData.info.config = newConfig;
				setStatusBar("Mod config updated successfully", 0, "success");
			}
		});
	}

	getBaseModData() {
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

	setIsLoadingMods(isLoading) {
		if (isLoading === this.isLoadingMods) return logWarn("Cannot set isLoadingMods to the same value.");

		this.isLoadingMods = isLoading;

		if (isLoading) {
			getElement("mods-load-button").innerText = "Loading...";
			getElement("mods-load-button").classList.add("loading");
		} else {
			getElement("mods-load-button").innerText = "Load more mods";
			getElement("mods-load-button").classList.remove("loading");
		}

		if (this.isLoadingMods) addBlockingTask("isLoadingMods");
		else removeBlockingTask("isLoadingMods");
	}

	setIsQueueingAction(isQueueing) {
		if (isQueueing === this.isQueueingAction) return logWarn("Cannot set isQueueingAction to the same value");
		this.isQueueingAction = isQueueing;
		if (this.isQueueingAction) addBlockingTask("isQueueingAction");
		else removeBlockingTask("isQueueingAction");
	}

	setIsPerformingActions(isPerforming) {
		if (isPerforming === this.isPerformingActions) return logWarn("Cannot set isPerformingActions to the same value");
		this.isPerformingActions = isPerforming;

		getElement("action-queue-content").classList.toggle("performing", isPerforming);

		if (this.isPerformingActions) {
			addBlockingTask("isPerformingActions");
			getElement("action-execute-button").innerText = "Executing...";
			getElement("action-execute-button").classList.add("active");
			getElement("action-execute-button").classList.add("block-cursor");
		} else {
			removeBlockingTask("isPerformingActions");
			getElement("action-execute-button").innerText = "Execute";
			getElement("action-execute-button").classList.remove("active");
			getElement("action-execute-button").classList.remove("block-cursor");
		}
	}

	convertInstalledModToModData(mod) {
		let modData = this.getBaseModData();
		modData.modID = mod.info.modID;
		modData.info = mod.info;
		modData.votes = null; // Votes are not available for installed mods
		modData.lastUpdated = "local"; // Local mods are always "local"
		modData.renderedDescription = mod.renderedDescription;
		modData.versions = mod.versions || null;
		modData.isInstalled = true;
		modData.isEnabled = mod.isEnabled;
		return modData;
	}

	convertRemoteModToModData(mod) {
		let modData = this.getBaseModData();
		modData.modID = mod.modID;
		modData.info = mod.modData;
		modData.votes = mod.votes;
		modData.lastUpdated = convertUploadTimeToString(mod.uploadTime);
		modData.renderedDescription = mod.renderedDescription;
		modData.versions = mod.versionNumbers;
		modData.isInstalled = false;
		modData.isEnabled = false;
		return modData;
	}

	// ------------ ACTIONS ------------

	async instantMainAction(modID, type) {
		if (this.isLoadingMods || this.isPerformingActions || this.isQueueingAction) pingBlockingTask("Cannot perform instant main action as mods are currently loading or actions are being performed.");

		logDebug(`Performing instant main action for mod '${modID}' of type ${type}`);

		// Clear the main action queue
		this.setIsQueueingAction(true);
		logDebug("Clearing all queued actions before performing instant action");
		this._clearCompletedActions();
		while (this.allQueuedActions.size > 0) {
			this._removeActionAndParents(Object.keys(this.allQueuedActions)[0]);
		}
		this.setIsQueueingAction(false);

		// Queue this as a main action
		if (await this.queueMainAction(modID, type)) {
			// Only if it was successful perform the queued actions
			await this.performQueuedActions();
		}
	}

	async queueMainAction(modID, type) {
		// If we are already doing something then just queue up the action
		if (this.isLoadingMods || this.isPerformingActions || this.isQueueingAction) {
			logWarn(`Cannot queue action for mod '${modID}' as we are currently loading mods or performing actions, adding to the queue queue...`);
			this.actionQueueQueue.push({ what: "queue", modID, type });
			return false;
		}

		await this._processActionQueueQueue();

		// There should not be an existing action for this mod, and the mod should exist
		if (this.mainQueuedActions[modID] != null || this.allQueuedActions[modID] != null) {
			logWarn(`Mod '${modID}' already has a queued action.`);
			return false;
		}
		if (!this.modRows[modID]) {
			logError(`Mod row for '${modID}' does not exist, cannot queue action`);
			return false;
		}

		// The frontend can only queue "install" or "uninstall" the backend can handle "change"
		if (!(type == "install" || type === "uninstall")) {
			logError(`Invalid action type '${type}' for mod '${modID}'`);
			return false;
		}

		// Finally we can start the queueing process
		this.setIsQueueingAction(true);
		this.setActionQueueLoading(true);
		this.setActionQueueVisible(true);
		setStatusBar(`Queueing action for mod '${modID}'...`, 0, "loading");

		// Clear out any "completed" actions
		this._clearCompletedActions();

		// Make the new main action as loading
		const modRow = this.modRows[modID];
		const newMainAction = { modID, version: modRow.modData.info.version, type };
		newMainAction.state = "loading";
		this.mainQueuedActions[modID] = newMainAction;
		this.allQueuedActions[modID] = newMainAction;
		this._addActionRowElement(newMainAction);
		this._setActionElementPreviewsVisible(newMainAction, true, "loading");
		newMainAction.element.classList.toggle("loading", true);

		// Try update the queue with this new main action
		const res = await this._updateAllActions();

		if (!res.success) {
			logError(`Failed to queue '${type}' action for mod '${modID}':`, JSON.stringify(res));
			newMainAction.state = "failed";
			newMainAction.element.classList.toggle("loading", false);
			newMainAction.element.classList.toggle("failed", true);
			this._setActionElementPreviewsVisible(newMainAction, true, "failed");
			this.setIsQueueingAction(false);
			this.setActionQueueLoading(false);
			setStatusBar(`Failed to queue '${type}' action for mod '${modID}'${res.data.errorReason ? ": " + res.data.errorReason : ""}`, 0, "failed");
			return false;
		}

		// Accept the new main action
		newMainAction.state = "queued";
		this.setIsQueueingAction(false);
		this.setActionQueueLoading(false);
		setStatusBar(`Queued action for mod '${modID}'`, 0, "success");
		logDebug(`Queued main action for mod '${modID}' of type '${type}'`);
		await this._processActionQueueQueue();
		return true;
	}

	async unqueueAction(modID) {
		// If we are already doing something then just queue up the action
		if (this.isLoadingMods || this.isPerformingActions || this.isQueueingAction) {
			logWarn(`Cannot unqueue action for mod '${modID}' as we are currently loading mods or performing actions, adding to the queue queue...`);
			this.actionQueueQueue.push({ what: "unqueue", modID });
			return;
		}
		await this._processActionQueueQueue();

		this._clearCompletedActions();

		if (!this.allQueuedActions[modID]) return logWarn(`No queued action for mod '${modID}' to unqueue.`);

		this.setIsQueueingAction(true);
		this._removeActionAndParents(modID);
		this._updateAllActions();
		this.setIsQueueingAction(false);

		await this._processActionQueueQueue();
	}

	async performQueuedActions() {
		if (this.isLoadingMods || this.isPerformingActions) pingBlockingTask("Cannot perform actions as mods are currently loading or actions are being performed.");

		this._clearCompletedActions();

		if (Object.keys(this.allQueuedActions).length === 0) return logWarn("No actions to perform, returning");

		this.setIsPerformingActions(true);
		this.setActionQueueLoading(true);
		setStatusBar("Performing actions...", 0, "loading");

		// Ask the backend to perform the actions
		const res = await api.invoke("fl:perform-mod-actions", this.allQueuedActions);
		if (!res.success) {
			logError("Failed to perform actions:", JSON.stringify(res.data));
			setStatusBar(`Failed to perform actions${res.data.errorReason ? ": " + res.data.errorReason : ""}`, 0, "failed");
			this.setIsPerformingActions(false);
			return;
		}

		// Set each action as complete
		for (const actionID in this.allQueuedActions) {
			const action = this.allQueuedActions[actionID];
			action.state = "complete";
			action.element.classList.toggle("loading", false);
			action.element.classList.toggle("failed", false);
			action.element.classList.toggle("complete", true);
		}

		this.setIsPerformingActions(false);
		this.setActionQueueLoading(false);
		setStatusBar("All actions performed successfully", 0, "success");

		this.reloadMods();
	}

	_removeActionAndParents(modID) {
		// This function should only be called by other main functions so we can make some expectations here
		if (!this.isQueueingAction && !this.isPerformingActions) return logError("Cannot unqueue main action as we are not queueing or performing actions, this should not happen");

		const action = this.allQueuedActions[modID];
		if (!action) return;
		logDebug(`Removing action for mod '${modID}'`);

		this._removeActionRowElement(action);
		this._setActionElementPreviewsVisible(action, false);
		delete this.allQueuedActions[modID];
		if (this.mainQueuedActions[modID]) delete this.mainQueuedActions[modID];

		// Find all nodes that have this as a parent
		for (const childModID in this.allQueuedActions) {
			const childAction = this.allQueuedActions[childModID];
			if (childAction.parents && childAction.parents.includes(modID)) {
				logDebug(`Removing child action for mod '${childModID}' as it has parent '${modID}'`);
				this._removeActionAndParents(childModID);
			}
		}

		// Recurse up to parents and delete them if needed
		if (action.parents) {
			for (const parentActionModID of action.parents) {
				logDebug(`Removing parent action for mod '${parentActionModID}'`);
				this._removeActionAndParents(parentActionModID);
			}
		}
	}

	async _updateAllActions() {
		// This function should only be called by other main functions so we can make some expectations here
		if (!this.isQueueingAction && !this.isPerformingActions) return logError("Cannot update all actions as we are not queueing or performing actions, this should not happen");

		// Ask the backend to figure out all the actions based on the main actions
		logDebug("Updating all actions based on the main actions");
		const res = await api.invoke("fl:calculate-mod-actions", this.mainQueuedActions);
		if (!res.success) return res;

		// Re-create the full action queue element with each action
		this.allQueuedActions = res.data;
		getElement("action-queue-content").innerHTML = "";
		for (const actionModID in this.allQueuedActions) {
			this._addActionRowElement(this.allQueuedActions[actionModID]);
			this._setActionElementPreviewsVisible(this.allQueuedActions[actionModID], true, "queued");
		}

		return { success: true };
	}

	_clearCompletedActions() {
		// We want to clear out any completed actions that are no longer needed
		for (const modID in this.allQueuedActions) {
			const action = this.allQueuedActions[modID];
			if (action.state === "complete" || action.state === "failed") {
				logDebug(`Removing completed action for mod '${modID}'`);
				this._removeActionRowElement(action);
				this._setActionElementPreviewsVisible(action, false);
				delete this.allQueuedActions[modID];
				delete this.mainQueuedActions[modID];
			}
		}
	}

	async _processActionQueueQueue() {
		// Process the queue queue carefully as to not cause an infinite recursive loop
		while (this.actionQueueQueue.length > 0) {
			logDebug(`Processing action queue queue, ${this.actionQueueQueue.length} actions queued...`);
			const firstQueueQueueAction = this.actionQueueQueue.shift();
			if (firstQueueQueueAction.what === "queue") {
				await this.queueMainAction(firstQueueQueueAction.modID, firstQueueQueueAction.type);
			} else if (firstQueueQueueAction.what === "unqueue") {
				await this.unqueueAction(firstQueueQueueAction.modID);
			}
		}
	}

	_addActionRowElement(action) {
		// Create the action element and add it to the action queue
		const isSub = action.parents && action.parents.length > 0;
		action.element = createElement(`
			<div class="action${isSub ? " sub" : ""}">
				<span class="action-type">${action.type}</span>
				<span class="action-id">${action.modID}</span>
				${action.version ? '<span class="action-data">' + action.version + "</span>" : ""}
				<img src="assets/close.png" class="action-remove">
			</div>
		`);

		action.element.addEventListener("click", (e) => {
			e.stopPropagation();
			this.unqueueAction(action.modID);
		});

		if (isSub) {
			getElement("action-queue-content").appendChild(action.element);
		} else {
			getElement("action-queue-content").insertBefore(action.element, getElement("action-queue-content").firstChild);
		}

		// Show the action queue as there has to be at least one action
		getElement("action-queue-no-content").style.display = "none";
		getElement("action-queue-content").style.display = "block";
	}

	_removeActionRowElement(action) {
		logDebug(`Removing action row element for mod '${action.modID}': ${action.element}`);

		if (!action.element || !action.element.parentNode) {
			logError(`Action element for mod '${action.modID}' does not exist, cannot remove action row`);
			return;
		}

		// Remove the action element from the action queue
		const parent = action.element.parentNode;
		parent.removeChild(action.element);
		action.element = null;

		// Hide the action queue if there are no more actions
		if (parent.children.length === 0) {
			getElement("action-queue-no-content").style.display = "block";
			getElement("action-queue-content").style.display = "none";
		}
	}

	_setActionElementPreviewsVisible(action, visible, type = "queued") {
		if (action.type == "install") {
			// Highlight / unhighlight the install button
			if (!this.modRows[action.modID]) return;

			const installButton = this.modRows[action.modID].element.querySelector(".mod-row-status .main-img");
			if (!installButton && !visible) return;

			installButton.classList.toggle("active", visible);
			const installHoverButton = this.modRows[action.modID].element.querySelector(".mod-row-status .hover-img");
			if (visible) {
				if (type == "queued") installHoverButton.src = "assets/install.png";
				else if (type == "loading") installHoverButton.src = "assets/loading.gif";
				else if (type == "failed") installHoverButton.src = "assets/cross.png";
				else if (type == "complete") installHoverButton.src = "assets/check.png";
			} else {
				installHoverButton.src = "assets/install.png";
			}
		}
	}

	setActionQueueVisible(visible) {
		if (visible === this.isActionQueueVisible) return logWarn("Cannot set isActionQueueVisible to the same value");
		this.isActionQueueVisible = visible;
		const actionQueue = getElement("action-queue");
		actionQueue.classList.toggle("open", visible);
		const hider = actionQueue.querySelector(".hider");
		hider.style.display = visible ? "block" : "none";
	}

	setActionQueueLoading(loading) {
		if (loading === this.isActionQueueLoading) return logWarn("Cannot set isActionQueueLoading to the same value");
		this.isActionQueueLoading = loading;
		const loadingIcon = getElement("action-queue-loading-icon");
		loadingIcon.style.display = loading ? "block" : "none";
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
		api.on("fl:fluxloader-config-updated", (_, config) => {
			logDebug("Received config update for FluxLoader");
			this.forceSetConfig(config);
		});

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
				setStatusBar("Failed to set config", 0, "error");
			} else {
				logDebug("Config set successfully.");
				setStatusBar("Config updated successfully", 0, "success");
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
	errorNotificationElement = null;
	errorNotificationCount = 0;
	tabContainer = null;
	mainContainer = null;

	async setup() {
		api.on("fl:forward-log", (_, log) => {
			this.receiveLogFromRemote(log);
		});

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
					<img class="logs-tab-icon" src="assets/cross.png" style="display: none;">
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
			this.sources[source].hasErrorNotification = false;
		}

		// Select the default log source
		this.selectLogSource("manager");

		this.isSetup = true;

		// Request the logs that have made up to this point
		const managerLogs = await api.invoke("fl:request-manager-logs");
		for (let i = this.remoteLogIndex; i < managerLogs.length; i++) this.receiveLogFromRemote(managerLogs[i], false);
	}

	selectTab() {
		this.updateLogView();
	}

	deselectTab() {
		this.setErrorNotification(this.selectedLogSource, false);
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
			this.setErrorNotification(this.selectedLogSource, false);
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

	receiveLogFromRemote(log, notifyErrors = true) {
		// Have to assume received logs in-order
		this.addLog(log, notifyErrors);
		this.remoteLogIndex++;
	}

	addLog(log, notifyErrors = true) {
		if (!this.isSetup) {
			console.log("Logs tab not setup yet, cannot add log.");
			return;
		}

		if (!log || !log.timestamp || !log.level || !log.message) {
			logWarn(`Invalid log entry: ${JSON.stringify(log)}`);
			return;
		}

		if (log.level === "error" && notifyErrors) this.setErrorNotification(log.source, true);

		this.sources[log.source].logs.push(log);

		if (selectedTab == "logs" && this.selectedLogSource === log.source) this.updateLogView();
	}

	setErrorNotification(source, toggled = true) {
		logDebug(`Setting error notification for source '${source}' to ${toggled}`);
		if (this.sources[source].hasErrorNotification === toggled) return;
		this.sources[source].tabElement.querySelector(".logs-tab-icon").style.display = toggled ? "block" : "none";
		this.sources[source].hasErrorNotification = toggled;
		this.errorNotificationCount += toggled ? 1 : -1;
		logDebug(`Error notification count is now ${this.errorNotificationCount}`);
		this.errorNotificationElement.style.display = this.errorNotificationCount > 0 ? "block" : "none";
	}
}

class LoadOrderTab {
	loadOrder = [];
	isManual = null;

	async setup() {
		api.on("fl:load-order-updated", (_, loadOrder) => this.onLoadOrderUpdated(loadOrder));
		this.loadOrder = await api.invoke("fl:get-load-order");
		const isManual = await api.invoke("fl:get-is-load-order-manual");
		await this.setIsManual(isManual);
		const toggleManualLoadOrder = getElement("load-order-manual-toggle");
		toggleManualLoadOrder.onchange = async (e) => await this.setIsManual(e.target.checked);
		this.renderLoadOrder();
		this.setupDraggingElements();
	}

	async setIsManual(isManual) {
		if (this.isManual === isManual) return logWarn("Cannot set isManual to the same value");
		this.isManual = isManual;
		const container = getElement("load-order-container");
		container.classList.toggle("auto", !isManual);
		const toggleManualLoadOrder = getElement("load-order-manual-toggle");
		toggleManualLoadOrder.checked = isManual;
		await api.invoke("fl:set-is-load-order-manual", isManual);
	}

	async onLoadOrderUpdated(loadOrder) {
		logDebug("Received load order update from backend:", loadOrder);
		this.loadOrder = loadOrder;
		this.renderLoadOrder();
	}

	async onLoadOrderRearranged(loadOrder) {
		this.loadOrder = loadOrder;
		await api.invoke("fl:set-manual-load-order", loadOrder);
	}

	setupDraggingElements() {
		const container = getElement("load-order-container");

		// Common variables for the dragging
		let isDragging = false;
		let draggingElement = null;
		let cloneElement = null;
		let placeholderElement = null;
		let offsetY = 0;

		const onMouseMove = (e) => {
			if (!isDragging) return;

			// Move the placeholder with the mouse
			cloneElement.style.top = `${e.clientY - offsetY}px`;

			// Loop through each item in the container
			const items = container.querySelectorAll(".load-order-item");
			let nextItem = null;

			for (const item of items) {
				if (item === draggingElement) continue;
				const box = item.getBoundingClientRect();
				const middle = box.top + box.height / 2;

				// We want to find the first element that is "lower" than the mouse
				if (e.clientY < middle) {
					nextItem = item;
					break;
				}
			}

			// Put the placeholder either just before an element or at the end
			if (nextItem) container.insertBefore(placeholderElement, nextItem);
			else container.appendChild(placeholderElement);
		};

		const onMouseUp = (e) => {
			if (!isDragging) return;

			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);

			// Move the element to right place, remove the others
			container.insertBefore(draggingElement, placeholderElement);
			draggingElement.style.display = "flex";
			cloneElement.remove();
			placeholderElement.remove();
			cloneElement = null;
			placeholderElement = null;
			draggingElement = null;

			// Update load order based on the element orders
			const newLoadOrder = Array.from(container.children).map((el) => el.dataset.modID);
			this.onLoadOrderRearranged(newLoadOrder);
			isDragging = false;
		};

		container.addEventListener("mousedown", (e) => {
			if (isDragging) return;

			draggingElement = e.target.closest(".load-order-item");
			if (!draggingElement) return;
			isDragging = true;

			// Find the mouses offset from the boxes position
			const rect = draggingElement.getBoundingClientRect();
			offsetY = e.clientY - rect.top;

			// Add a visual dragging clone to the document
			cloneElement = draggingElement.cloneNode(true);
			cloneElement.classList.add("load-order-item-drag-clone");
			cloneElement.style.left = `${rect.left}px`;
			cloneElement.style.top = `${rect.top}px`;
			cloneElement.style.width = `${rect.width}px`;
			document.body.appendChild(cloneElement);

			// Put a placeholder in the container to indicate drop position
			placeholderElement = document.createElement("div");
			placeholderElement.className = "load-order-item-placeholder";
			placeholderElement.style.height = `${rect.height}px`;
			container.insertBefore(placeholderElement, draggingElement.nextSibling);

			// Hide the current dragging element
			draggingElement.style.display = "none";

			// Listen for further drag events
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		});
	}

	async renderLoadOrder() {
		const container = getElement("load-order-container");
		container.innerHTML = "";
		this.loadOrderElements = [];

		if (this.loadOrder.length === 0) return;

		for (const modID of this.loadOrder) {
			const itemElement = createElement(`<div class="load-order-item"><span>${modID}</span><img src="assets/grab.png" /></div>`);
			itemElement.dataset.modID = modID;
			container.appendChild(itemElement);
		}
	}
}

class CreateModTab {
	static modCreateRequestSchema = {
		modID: {
			type: "string",
			pattern: "^[a-zA-Z0-9_-]+$",
		},
		name: {
			type: "string",
			pattern: ".+",
		},
		version: {
			type: "semver",
			default: "1.0.0",
		},
		author: {
			type: "string",
			default: "",
			pattern: ".+",
		},
		fluxloaderVersion: {
			type: "semver",
			default: ">=2.0.0",
		},
		shortDescription: {
			type: "string",
			default: "",
		},
		description: {
			type: "string",
			default: "",
		},
		electronEntrypointEnabled: {
			type: "boolean",
			default: true,
		},
		electronEntrypointName: {
			type: "string",
			default: "entry.electron.js",
			pattern: ".+",
		},
		gameEntrypointEnabled: {
			type: "boolean",
			default: true,
		},
		gameEntrypointName: {
			type: "string",
			default: "entry.game.js",
			pattern: ".+",
		},
		workerEntrypointEnabled: {
			type: "boolean",
			default: true,
		},
		workerEntrypointName: {
			type: "string",
			default: "entry.worker.js",
			pattern: ".+",
		},
		scriptEnabled: {
			type: "boolean",
			default: false,
		},
		scriptPath: {
			type: "string",
			default: "script.js",
			pattern: ".+",
		},
	};

	renderer = null;
	modCreateRequestData = {};

	async setup() {
		this.modCreateRequestData = {};
		SchemaValidation.validate(this.modCreateRequestData, CreateModTab.modCreateRequestSchema);

		const submitButton = getElement("create-mod-submit");
		submitButton.addEventListener("click", async () => this.submitModInfo());

		const container = getElement("create-mod-schema-container");
		this.renderer = new ConfigSchemaElement(
			container,
			this.modCreateRequestData,
			CreateModTab.modCreateRequestSchema,
			(newConfig) => (this.modCreateRequestData = newConfig),
			(value, schemaValue) => this.extraValidation(value, schemaValue)
		);
	}

	async selectTab() {
		if (!this.renderer) await this.setup();
		else this.renderer.forceSetConfig(this.modCreateRequestData);
	}

	extraValidation(value, schemaValue) {
		if (schemaValue.type === "string") {
			if (tabs.mods.modRows[value]) {
				return { success: false, error: "Mod ID already exists, please choose a different one." };
			}
		}
		return { success: true };
	}

	async submitModInfo() {
		if (!SchemaValidation.validate(this.modCreateRequestData, CreateModTab.modCreateRequestSchema)) {
			setStatusBar("Mod creation data is invalid, please check the fields.", 0, "failed");
			logError("Mod creation data is invalid:", this.modCreateRequestData);
			return;
		}

		setStatusBar("Creating mod...", 0, "loading");
		const res = await api.invoke("fl:create-new-mod", this.modCreateRequestData);
		if (!res.success) {
			setStatusBar("Failed to create mod: " + (res && res.data ? res.data : "Unknown error"), 0, "failed");
		} else {
			setStatusBar("Mod created successfully!", 0, "success");
			await selectTab("mods");
			await tabs.mods.reloadMods();
			await tabs.mods.selectMod(this.modCreateRequestData.modID);
		}
	}
}

async function setupTabs() {
	tabs.logs = new LogsTab();
	tabs.mods = new ModsTab();
	tabs.config = new ConfigTab();
	tabs.loadOrder = new LoadOrderTab();
	tabs.createMod = new CreateModTab();

	for (const tab in tabs) {
		getElement(`tab-${tabNameToID(tab)}`).addEventListener("click", async () => {
			await selectTab(tab);
		});
		if (tabs[tab].setup) await tabs[tab].setup();
	}
}

async function selectTab(tab) {
	if (selectedTab) {
		getElement(`tab-${tabNameToID(selectedTab)}`).classList.remove("selected");
		getElement(`${tabNameToID(selectedTab)}-tab-content`).style.display = "none";
		if (tabs[selectedTab].deselectTab) await tabs[selectedTab].deselectTab();
	}

	selectedTab = tab;

	getElement(`tab-${tabNameToID(tab)}`).classList.add("selected");
	getElement(`${tabNameToID(tab)}-tab-content`).style.display = "block";
	if (tabs[tab].selectTab) await tabs[tab].selectTab();
}

function tabNameToID(tabName) {
	// convert camCase to kebab-case
	return tabName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

// =================== MAIN ===================

function setIsPlaying(playing) {
	if (isPlaying === playing) return pingBlockingTask(`Tried to set isPlaying to ${playing} but it is already set to that.`);
	isPlaying = playing;
	if (isPlaying) addBlockingTask("isPlaying");
	else removeBlockingTask("isPlaying");
}

function setIsPlayButtonLoading(loading) {
	if (isPlayButtonLoading === loading) return pingBlockingTask(`Tried to set isPlayButtonLoading to ${loading} but it is already set to that.`);
	isPlayButtonLoading = loading;
	if (isPlayButtonLoading) addBlockingTask("isPlayButtonLoading");
	else removeBlockingTask("isPlayButtonLoading");
}

function setFullscreenAlert(title, text, buttons) {
	if (isFullscreenAlertVisible) return pingBlockingTask("Tried to set fullscreen alert but it is already visible.");
	isFullscreenAlertVisible = true;
	addBlockingTask("isFullscreenAlertVisible");

	const alertElement = getElement("fullscreen-alert");

	alertElement.querySelector(".alert-title").style.display = title == null || title === "" ? "none" : "block";
	alertElement.querySelector(".alert-title").innerText = title;

	alertElement.querySelector(".alert-text").innerText = text;

	const buttonContainer = alertElement.querySelector(".alert-buttons");
	buttonContainer.innerHTML = "";

	buttons.forEach((button) => {
		const buttonElement = createElement(`<button class="alert-button">${button.text}</button>`);
		buttonElement.addEventListener("click", () => {
			button.onClick();
			alertElement.style.display = "none";
			isFullscreenAlertVisible = false;
			removeBlockingTask("isFullscreenAlertVisible");
		});
		buttonContainer.appendChild(buttonElement);
	});

	alertElement.style.display = "flex";
}

function setStatusBar(text, percent, icon = null) {
	getElement("footer-progress-text").innerText = text;
	getElement("footer-progress-bar").style.width = `${percent}%`;
	if (icon == null) {
		getElement("footer-progress-icon").style.display = "none";
	} else {
		getElement("footer-progress-icon").style.display = "block";
		const map = {
			success: "assets/check.png",
			failed: "assets/cross.png",
			loading: "assets/loading.gif",
		};
		getElement("footer-progress-icon").src = map[icon] || icon;
	}
}

function setConnectionState(state) {
	let options = ["offline", "connecting", "online"];
	if (!options.includes(state)) {
		console.error(`Invalid connection state: ${state}. Expected one of ${options.join(", ")}`);
	}
	if (connectionState === state) {
		logDebug(`Connection state is already '${state}', no change needed`);
		return;
	}
	for (const option of options) {
		getElement("connection-indicator").classList.toggle(option, option === state);
	}
	if (state == "online") {
		getElement("connection-button").innerText = "Disconnect";
	} else if (state == "connecting") {
		getElement("connection-button").innerText = "Connecting";
	} else if (state == "offline") {
		getElement("connection-button").innerText = "Connect";
	}
	connectionState = state;
}

async function handleClickConnectionButton(e) {
	if (isPlaying || tabs.mods.isLoadingMods || tabs.mods.isPerformingActions || isPlayButtonLoading) {
		return pingBlockingTask("Cannot change connection state while playing, loading mods, or performing actions.");
	}
	// Instantly disconnect
	if (connectionState === "online") {
		logDebug("Disconnecting from the server...");
		setConnectionState("offline");
	}

	// Warn if connecting - the blocking check above should prevent this from happening
	else if (connectionState === "connecting") {
		logError("Already connecting to the server, ignoring click - this shouldn't happen.");
	}

	// Attempt to connect if offline
	else if (connectionState === "offline") {
		addBlockingTask("connecting");
		setConnectionState("connecting");
		logDebug("Attempting to connect to the server...");
		const res = await api.invoke("fl:ping-server");
		if (res.success) {
			logDebug("Successfully pinged the server, connection is online.");
			setConnectionState("online");

			// If succesfully connect then fetch installed mods versions
			await tabs.mods.loadInstalledModsVersions();
		} else {
			logError("Failed to ping the server, connection is offline");
			setConnectionState("offline");
		}
		removeBlockingTask("connecting");
	}
}

async function handleClickPlayButton(unmodded = false) {
	if (isPlayButtonLoading || tabs.mods.isLoadingMods || tabs.mods.isPerformingActions) return pingBlockingTask("Cannot change game state while loading mods or performing actions.");

	setIsPlayButtonLoading(true);
	updatePlayButton();
	getElement("play-button").classList.toggle("active", true);
	getElement("footer-dropdown").classList.toggle("active", true);
	getElement("footer-dropdown-menu").style.display = "none";
	setStatusBar("Loading...", 0, "loading");

	if (!isPlaying) {
		let res;
		if (unmodded) {
			res = await api.invoke(`fl:start-unmodded-game`);
		} else {
			res = await api.invoke(`fl:start-game`);
		}

		if (!res.success) {
			logError("Failed to start the game, please check the logs for more details");
			setStatusBar(`Failed to start game${res.data.errorReason ? ": " + res.data.errorReason : ""}`, 0, "failed");
		} else {
			setStatusBar("Game started", 0, "success");
		}
		getElement("play-button").classList.toggle("active", res.success);
		getElement("footer-dropdown").classList.toggle("active", res.success);
		isPlaying = res.success;
		setIsPlayButtonLoading(false);
		updatePlayButton();
	} else {
		await api.invoke(`fl:close-game`);
		setStatusBar("Game stopped", 0, "success");
		getElement("play-button").classList.toggle("active", false);
		getElement("footer-dropdown").classList.toggle("active", false);
		setIsPlayButtonLoading(false);
		setIsPlaying(false);
		updatePlayButton();
	}
}

function updatePlayButton() {
	if (isPlayButtonLoading) {
		getElement("play-button").innerText = "Loading...";
	} else {
		getElement("play-button").innerText = isPlaying ? "Stop" : "Start";
	}
}

function addBlockingTask(task) {
	blockingTasks.add(task);
	logDebug(`Added blocking task: ${task}`);
	if (blockingTasks.size === 1) {
		const blockingIndicator = getElement("blocking-indicator");
		blockingIndicator.style.opacity = "1";
		blockingIndicator.classList.remove("animate");
		blockingIndicator.querySelector("img").src = "assets/loading.gif";
	}
}

function removeBlockingTask(task) {
	if (!blockingTasks.delete(task)) {
		logWarn(`Tried to remove blocking action that does not exist: ${task}`);
		return;
	}
	logDebug(`Removed blocking task: ${task}`);
	if (blockingTasks.size === 0) {
		const blockingIndicator = getElement("blocking-indicator");
		blockingIndicator.style.opacity = "0";
	}
}

function pingBlockingTask(message) {
	if (message && message.length > 0) logWarn(`Cannot perform action while blocking: ${message}`);
	const indicator = getElement("blocking-indicator");
	indicator.classList.remove("animate");
	void indicator.offsetWidth;
	indicator.classList.add("animate");
	setTimeout(() => {
		indicator.classList.remove("animate");
	}, 150);
}

// =================== DRIVER ===================

(async () => {
	await setupTabs();

	api.on(`fl:game-closed`, () => {
		if (!isPlaying) return logWarn("Received game closed event but isPlaying is false, ignoring.");
		setStatusBar("Game closed", 0, "success");
		setIsPlaying(false);
		updatePlayButton();
		getElement("play-button").classList.toggle("active", false);
		getElement("footer-dropdown").classList.toggle("active", false);
	});

	getElement("play-button").addEventListener("click", () => handleClickPlayButton());

	getElement("connection-button").addEventListener("click", (e) => handleClickConnectionButton(e));

	getElement("footer-dropdown-unmodded").addEventListener("click", (e) => {
		e.stopPropagation();
		handleClickPlayButton(true);
	});
	getElement("footer-dropdown").addEventListener("click", (e) => {
		e.stopPropagation();
		if (isPlaying) return;
		getElement("footer-dropdown-menu").style.display = getElement("footer-dropdown-menu").style.display === "none" ? "block" : "none";
	});

	document.querySelectorAll(".resizer").forEach(handleResizer);

	setStatusBar("", 0);
	selectTab("mods");

	logDebug("FluxLoader Manager started.");
})();
