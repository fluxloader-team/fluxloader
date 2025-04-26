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

class ModsTab {
	static pageSize = 40;

	columns = {};
	loadedPages = 0;
	modRows = {};
	selectedMod = null;
	filterInfo = { search: null, tags: [] };
	isFetchingRemoteMods = false;

	// --- Loading ---

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
			this.isFetchingRemoteMods = true;
			getElement("mods-load-button").innerText = "Loading...";
			this.reloadModList();
		});
	}

	selectTab() {
		this.reloadModList();
	}

	deselectTab() {
		// TODO
	}

	reloadModList() {
		this.modRows = {};

		const getInfo = {
			page: 1,
			fetchRemote: this.isFetchingRemoteMods,
			pageSize: ModsTab.pageSize,
			search: this.filterInfo.search,
			tags: this.filterInfo.tags,
		};

		setProgressText("Fetching mods...");
		setProgress(0);

		electron.invoke("ml-modloader:get-all-mods", getInfo).then(({ mods, sucess, message }) => {
			const tbody = getElement("mods-tab-table").querySelector("tbody");
			tbody.innerHTML = "";
			for (const mod of mods) {
				const row = this.createModRow(mod);
				this.modRows[mod.info.modID] = row;
				tbody.appendChild(row.element);
			}

			this.loadedPages++;

			// Reselect the selected mod if it is still visible
			if (this.selectedMod != null) {
				const oldSelectedMod = this.selectedMod;
				this.selectedMod = null;
				this.selectMod(oldSelectedMod);
			}

			getElement("mods-load-button").innerText = "Load more mods";

			setProgressText(message);
			setProgress(0);
		});
	}

	loadMoreMods() {
		const getInfo = {
			continue: true,
			pageOffset: this.loadedPages,
			pageSize: ModsTab.pageSize,
		};

		electron.invoke("ml-modloader:get-all-mods", getInfo).then((mods) => {
			const tbody = getElement("mods-tab-table").querySelector("tbody");
			for (const mod of mods) {
				const row = this.createModRow(mod);
				this.modRows[mod.info.modID] = row;
				tbody.appendChild(row.element);
			}
			this.loadedPages++;
		});
	}

	createModRow(mod) {
		const element = createElement(
			`
			<tr>
				<td>
				` +
				(mod.isInstalled ? `<input type="checkbox" ${mod.isEnabled ? "checked" : ""}>` : ``) +
				`
				</td>
				<td>${mod.info.name}</td>
				<td>${mod.info.author}</td>
				<td>${mod.info.version}</td>
				<td>${mod.info.shortDescription || ""}</td>
				<td>${mod.info.lastUpdated || "N/A"}</td>
				<td class="mods-tab-table-tag-list">
				${
					mod.info.tags
						? mod.info.tags.reduce((acc, tag) => {
								return acc + `<span class="tag">${tag}</span>`;
						  }, "")
						: ""
				}
				</td>
			</tr>
		`
		);

		element.classList.toggle("disabled", mod.isInstalled && !mod.isEnabled);

		element.addEventListener("click", (e) => this.selectMod(mod.info.modID));

		if (mod.isInstalled) {
			const checkbox = element.querySelector("input[type='checkbox']");
			checkbox.addEventListener("click", (e) => e.stopPropagation());
			checkbox.addEventListener("change", (e) => {
				const checkbox = e.target;
				const isChecked = checkbox.checked;
				checkbox.disabled = true;
				electron.invoke("ml-modloader:set-mod-enabled", { modID: mod.info.modID, enabled: isChecked }).then((success) => {
					checkbox.disabled = false;
					if (!success) checkbox.checked = !isChecked;
					mod.isEnabled = checkbox.checked;
					element.classList.toggle("disabled", mod.isInstalled && !mod.isEnabled);
				});
			});
		}

		return { element, mod, isVisible: true };
	}

	// --- Running ---

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
		const mod = this.modRows[modID].mod;

		if (mod == null) {
			getElement("mod-info").style.display = "none";
			getElement("mod-info-empty").style.display = "block";
			return;
		}

		getElement("mod-info").style.display = "block";
		getElement("mod-info-empty").style.display = "none";

		getElement("mod-info-title").innerText = mod.info.name;

		if (mod.info.description && mod.info.description.length > 0) {
			getElement("mod-info-description").classList.remove("empty");
			electron.invoke("ml-modloader:render-markdown", mod.info.description).then((html) => {
				getElement("mod-info-description").innerHTML = html;
			});
		} else {
			getElement("mod-info-description").classList.add("empty");
			getElement("mod-info-description").innerText = "No description provided.";
		}

		getElement("mod-info-mod-id").innerText = mod.info.modID;
		getElement("mod-info-author").innerText = mod.info.author;
		getElement("mod-info-version").innerText = mod.info.version;
		getElement("mod-info-last-updated").innerText = mod.info.lastUpdated || "N/A";

		if (mod.info.tags) {
			getElement("mod-info-tags").classList.toggle("empty", mod.info.tags.length === 0);
			if (mod.info.tags.length === 0) {
				getElement("mod-info-tags").innerText = "No tags provided.";
			} else {
				getElement("mod-info-tags").innerHTML = "";
				for (const tag of mod.info.tags) {
					const tagElement = createElement(`<span class="tag">${tag}</span>`);
					getElement("mod-info-tags").appendChild(tagElement);
				}
			}
		}
	}

	// --- Filtering ---

	onSearchChanged() {
		const searchInput = getElement("mods-tab-search").value.toLowerCase();
		this.filterInfo.search = searchInput;
		this.reloadModList();
	}

	onSelectedTagsChanged() {
		// TODO
		this.reloadModList();
	}

	removeFiltering() {
		this.filterInfo.search = null;
		this.filterInfo.tags = [];
		this.reloadModList();
	}
}

// ---------------- Main ----------------

(() => {
	setupTabs();

	getElement("main-control-button").addEventListener("click", () => handleClickMainButton());

	document.querySelectorAll(".resizer").forEach(handleResizer);

	getElement("refresh-mods").addEventListener("click", () => {
		electron.invoke("ml-modloader:refresh-mods").then(() => tabs.mods.reloadModList());
	});

	setProgressText("");
	setProgress(0);
	selectTab("mods");
})();
