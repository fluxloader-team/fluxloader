// ---------------- Utility ----------------

let elements = {};
function getElement(id) {
	if (!elements[id]) {
		elements[id] = document.getElementById(id);
		if (!elements[id]) {
			console.error(`Element with id ${id} not found`);
			return null;
		}
	}
	return elements[id];
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

// ---------------- Definitions ----------------

let isPlaying = false;
let isMainButtonLoading = false;
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

function handleClickMainButton(button) {
	if (isMainButtonLoading) return;
	isMainButtonLoading = true;

	const mlEvent = isPlaying ? "stop-game" : "start-game";
	getElement("main-control-button").innerText = "Loading...";

	if (!isPlaying) getElement("main-control-button").classList.toggle("active", true);
	electron.invoke(`ml-modloader:${mlEvent}`).then(() => {
		isMainButtonLoading = false;
		isPlaying = !isPlaying;
		getElement("main-control-button").innerText = isPlaying ? "Stop" : "Play";
		getElement("main-control-button").classList.toggle("active", isPlaying);
	});
}

function setupTabs() {
	tabs.mods = new ModsTab();

	for (const tab in tabs) {
		getElement(`tab-${tab}`).addEventListener("click", () => {
			selectTab(tab);
		});

		if (tabs[tab]) {
			tabs[tab].setup();
		}
	}
}

function selectTab(tab) {
	if (selectedTab) {
		getElement(`tab-${selectedTab}`).classList.remove("selected");
		getElement(`${selectedTab}-tab-content`).style.display = "none";
		if (tabs[selectedTab]) tabs[selectedTab].deselectTab();
	}

	selectedTab = tab;

	getElement(`tab-${tab}`).classList.add("selected");
	getElement(`${tab}-tab-content`).style.display = "block";
	if (tabs[tab]) tabs[tab].selectTab();
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
	static pageSize = 200;

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
		const mods = await electron.invoke("ml-modloader:get-installed-mods");

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
			const modData = {
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

			this.modRows[modData.modID] = this.createModRow(modData);
			tbody.appendChild(this.modRows[modData.modID].element);
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
			pageSize: ModsTab.pageSize,
			page: this.currentModPage + 1,
		};
		const mods = await electron.invoke("ml-modloader:fetch-remote-mods", getInfo);

		if (mods == null || mods == []) {
			this.setLoadButtonText("Load mods");
			setConnectionIndicator("offline");
			setProgressText("No remote mods available.");
			this.isLoadingRemoteMods = false;
			return;
		}

		const tbody = getElement("mods-tab-table").querySelector("tbody");
		for (const mod of mods) {
			if (this.modRows[mod.modID] != null) {
				logDebug(`Skipping already existing mod: ${mod.modID}`);
				continue;
			}

			// Convert into modData format and put into the table
			const modData = {
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

			this.modRows[modData.modID] = this.createModRow(modData);
			tbody.appendChild(this.modRows[modData.modID].element);
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
				electron.invoke("ml-modloader:set-mod-enabled", { modID: modData.modID, enabled: isChecked }).then((success) => {
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
			electron.invoke("ml-modloader:render-markdown", modData.meta.info.description).then((html) => {
				getElement("mod-info-description").innerHTML = html;
			});
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
		console.log(`Installing mod ${modID} version ${version}`);
		this.queuedActions.push({ action: "install", modID, version });
		this.addQueueElement(this.queuedActions[this.queuedActions.length - 1]);
	}

	queueUninstall(modID) {
		if (this.isPerformingActions) return;
		console.log(`Uninstalling mod ${modID}`);
		this.queuedActions.push({ action: "uninstall", modID });
		this.addQueueElement(this.queuedActions[this.queuedActions.length - 1]);
	} 

	addQueueElement(action) {
	}

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

// ---------------- Main ----------------

(() => {
	setupTabs();

	getElement("main-control-button").addEventListener("click", () => handleClickMainButton());

	document.querySelectorAll(".resizer").forEach(handleResizer);

	getElement("refresh-mods").addEventListener("click", () => {
		electron.invoke("ml-modloader:find-installed-mods").then(() => tabs.mods.reloadModsView());
	});

	setProgressText("");
	setProgress(0);
	selectTab("mods");
})();
