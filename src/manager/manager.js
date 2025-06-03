import { SchemaValidation, Logging } from "../common.js";

// Some arbitrary delays that make it all feel a bit smoother
const DELAY_DESCRIPTION_LOAD_MS = 800;
const DELAY_PLAY_MS = 150;
const DELAY_LOAD_REMOTE_MS = 150;

// ---------------- LOGGING ----------------

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
	if (tabs && tabs.logs) tabs.logs.addLog(log);
}

// ---------------- UTILITY ----------------

let _elements = {};
function getElement(id) {
	if (!_elements[id]) {
		_elements[id] = document.getElementById(id);
		if (!_elements[id]) {
			logError(`Element with id ${id} not found`);
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
	constructor(parentElement, config, schema, onChange) {
		this.parentElement = parentElement;
		this.containerElement = null;
		this.contentElement = null;
		this.config = JSON.parse(JSON.stringify(config)); // Copy to avoid direct mutations
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

		// Perform first validation
		const isValid = SchemaValidation.validate(this.config, this.schema);
		this.setStatus(isValid ? "valid" : "invalid");

		// Populate with config / schema
		this.createSchemaSection(this.config, this.schema, this.contentElement, []);
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
				this.createSchemaSection(configSection?.[key] ?? {}, schemaValue, sectionContainer, currentPath);
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

				// Create the wrapper, label, description and add the input to the container
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

				this.inputs.set(currentPath.join("."), input);
				input.addEventListener("change", () => this.handleInputChange(currentPath, input, schemaValue));
				input.classList.add("config-input");

				if (schemaValue.type === "boolean") {
					wrapper.classList.add("same-row");
					wrapper.appendChild(input);
					wrapper.appendChild(labelRow);
				} else {
					wrapper.appendChild(labelRow);
					wrapper.appendChild(input);
				}

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
			this.setStatus("invalid");
			return;
		}

		// Finally assuming it is valid officially update the config
		input.classList.remove("invalid");
		this.setConfigValue(path, value);
		this.setStatus("valid");
		this.onChange(this.config);
	}

	getConfigValue(path) {
		// Get the corresponding value in the config object by navigating the path
		let obj = this.config;
		for (const key of path) {
			if (!Object.hasOwn(obj, key)) return undefined;
			obj = obj[key];
		}
		return obj;
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

	updateValues() {
		// Update all the input values based on the current config
		for (const [path, input] of this.inputs.entries()) {
			const value = this.getConfigValue(path.split("."));
			if (value === undefined) continue;
			if (input.type === "checkbox") {
				input.checked = value;
			} else {
				input.value = value;
			}
		}
	}

	setStatus(status) {
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

// ---------------- MAIN ----------------

let isPlaying = false;
let isMainControlButtonLoading = false;
let connectionIndicatorState = "offline";
let selectedTab = null;

globalThis.tabs = {
	mods: null,
	config: null,
	logs: null,
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
			// Wait for the game to finish
			electron.invoke(`fl:wait-for-game-closed`).then(() => {
				setProgressText("Game closed.");
				setProgress(0);

				isPlaying = false;
				updateMainControlButtonText();
				getElement("main-control-button").classList.toggle("active", false);
			});

			// Start the game after the cleanup listener is added
			electron.invoke(`fl:start-game`).then(() => {
				setProgressText("Game started.");
				setProgress(100);

				isMainControlButtonLoading = false;
				isPlaying = true;
				updateMainControlButtonText();
				getElement("main-control-button").classList.toggle("active", true);
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
	tabs.logs = new LogsTab();

	for (const tab in tabs) {
		getElement(`tab-${tab}`).addEventListener("click", async () => {
			await selectTab(tab);
		});

		if (tabs[tab] && tabs[tab].setup) {
			await tabs[tab].setup();
		}
	}
}

async function selectTab(tab) {
	if (selectedTab) {
		getElement(`tab-${selectedTab}`).classList.remove("selected");
		getElement(`${selectedTab}-tab-content`).style.display = "none";
		if (tabs[selectedTab] && tabs[selectedTab].deselectTab) await tabs[selectedTab].deselectTab();
	}

	selectedTab = tab;

	getElement(`tab-${tab}`).classList.add("selected");
	getElement(`${tab}-tab-content`).style.display = "block";
	if (tabs[tab] && tabs[tab].selectTab) await tabs[tab].selectTab();
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
	isModConfigOpen = false;
	hasLoadedOnce = false;
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
		if (!this.hasLoadedOnce) {
			this.hasLoadedOnce = true;
			this.reloadModsView();
		}
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

		// Listen to the checkbox for enabling / disabling mods
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
		this.setModConfigOpen(false);

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
			getElement("mod-info-title").innerText = modData.meta.info.name;

			// Update the mod info section
			getElement("mod-info").style.display = "block";
			getElement("mod-info-empty").style.display = "none";
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

			// Update the mod info buttons
			let buttons = [];
			if (modData.isInstalled) {
				buttons.push({ text: "Uninstall", onClick: () => this.queueUninstall(modData.modID) });
				if (modData.meta.info.configSchema) {
					buttons.push({ icon: "assets/config.png", onClick: () => this.setModConfigOpen(!this.isModConfigOpen), toggle: true });
				}
			} else {
				buttons.push({ text: "Install", onClick: () => this.queueInstall(modData.modID, modData.meta.info.version) });
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

	setModConfigOpen(enabled) {
		if (this.isModConfigOpen === enabled) return;

		this.isModConfigOpen = enabled;
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
		if (!modData.meta.info.configSchema) {
			logWarn(`Mod ${this.selectedMod} does not have a config schema, cannot show config.`);
			return;
		}
		configContainer.style.display = "block";
		modInfoContainer.style.display = "none";
		configContainer.innerHTML = "";
		const config = electron.invoke("fl-mod-config:get", this.selectedMod);
		const schema = modData.meta.info.configSchema;
		this.configRenderer = new ConfigSchemaElement(configContainer, config, schema, async (newConfig) => {
			logInfo(`Mod ${this.selectedMod} config changed, notifying electron...`);
			const success = await electron.invoke("fl-mod-config:set", {
				modID: this.selectedMod,
				config: newConfig,
			});
			if (!success) {
				logError(`Failed to set config for mod ${this.selectedMod}`);
				setProgressText("Failed to set mod config.");
				setProgress(0);
			} else {
				logInfo(`Config for mod ${this.selectedMod} set successfully.`);
				this.modRows[this.selectedMod].modData.meta.info.config = newConfig;
				setProgressText("Mod config updated successfully.");
				setProgress(0);
			}
		});
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
	renderer = null;

	async setup() {
		// Load config and schema and create the ConfigSchemaElement
		const config = await electron.invoke("fl:get-fluxloader-config");
		const configSchema = await electron.invoke("fl:get-fluxloader-config-schema");
		const mainElement = getElement("config-tab-content").querySelector(".main");
		this.renderer = new ConfigSchemaElement(mainElement, config, configSchema, async (newConfig) => {
			logInfo("Config changed, notifying electron...");
			const success = await electron.invoke("fl:set-fluxloader-config", newConfig);
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

	selectTab() {
		this.renderer.updateValues();
	}
}

class LogsTab {
	sources = { manager: {}, electron: {}, game: {} };
	selectedLogSource = null;
	remoteLogIndex = 0;

	setup() {
		// Clear and setup the elements
		const tabContainer = getElement("logs-tab-content").querySelector(".logs-tab-list");
		const mainContainer = getElement("logs-tab-content").querySelector(".logs-content-scroll");
		tabContainer.innerHTML = "";
		mainContainer.innerHTML = "";

		for (const source in this.sources) {
			// Create a selectable tab
			const tab = createElement(`
				<div class="option" data-source="${source}">
					<span class="logs-tab-text">${source.charAt(0).toUpperCase() + source.slice(1)}</span>
				</div>`);
			tab.addEventListener("click", () => this.selectLogSource(source));
			tabContainer.appendChild(tab);

			// Create a content container
			const content = createElement(`<div class="logs-content" style="display: none;" data-source="${source}"></div>`);
			mainContainer.appendChild(content);

			// Initialize the source data
			this.sources[source].logs = [];
			this.sources[source].renderedIndex = -1;
			this.sources[source].tabElement = tab;
			this.sources[source].contentElement = content;
		}

		this.selectLogSource("manager");
	}

	selectTab() {
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
		let i = sourceData.renderedIndex + 1;
		for (; i < logs.length; i++) {
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
	}

	addLog(log) {
		if (!log || !log.timestamp || !log.level || !log.message) {
			logWarn(`Invalid log entry: ${JSON.stringify(log)}`);
			return;
		}

		if (!this.sources[log.source]) {
			logError(`Unknown log source: ${log.source}`);
			return;
		}

		this.sources[log.source].logs.push(log);

		if (selectedTab == "logs" && this.selectedLogSource === log.source) this.updateLogView();
	}

	receiveLogs(logs) {
		for (let i = this.remoteLogIndex; i < logs.length; i++) this.addLog(logs[i]);
		this.remoteLogIndex = logs.length;
	}
}

// ---------------- DRIVER ----------------

(async () => {
	await setupTabs();

	electron.on("fl:forward-logs", (_, logs) => {
		if (tabs && tabs.logs) tabs.logs.receiveLogs(logs);
	});

	const managerLogs = await electron.invoke("fl:request-manager-logs");
	tabs.logs.receiveLogs(managerLogs);

	getElement("main-control-button").addEventListener("click", () => handleClickMainControlButton());

	document.querySelectorAll(".resizer").forEach(handleResizer);

	getElement("refresh-mods").addEventListener("click", () => {
		electron.invoke("fl:find-installed-mods").then(() => tabs.mods.reloadModsView());
	});

	setProgressText("");
	setProgress(0);
	selectTab("mods");

	logInfo("FluxLoader Manager started.");
})();
