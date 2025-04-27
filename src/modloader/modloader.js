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
	static pageSize = 200;

	columns = {};
	currentPage = 0;
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
		setProgressText("Fetching mods...");
		setProgress(0);

		this.currentPage = 1;
		this.modRows = {};
		const getInfo = {
			search: this.filterInfo.search,
			tags: this.filterInfo.tags,
			fetchRemote: this.isFetchingRemoteMods,
			pageSize: ModsTab.pageSize,
			page: 1,
		};

		electron.invoke("ml-modloader:get-all-mods", getInfo).then(({ mods, sucess, message }) => {
			console.log("Mods loaded:", mods.length, "success:", sucess, "message:", message);
			console.log(mods[0]);
			console.log(mods[10]);

			const tbody = getElement("mods-tab-table").querySelector("tbody");
			tbody.innerHTML = "";
			for (const mod of mods) {
				const row = this.createModRow(mod);
				this.modRows[mod.modID] = row;
				tbody.appendChild(row.element);
			}

			this.currentPage++;

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

	createModRow(mod) {
		const element = createElement(
			`
			<tr>
				<td>
				` +
				(mod.isInstalled ? `<input type="checkbox" ${mod.isEnabled ? "checked" : ""}>` : ``) +
				`
				</td>
				<td>${mod.meta.info.name}</td>
				<td>${mod.meta.info.author}</td>
				<td>${mod.meta.info.version}</td>
				<td>${mod.meta.info.shortDescription || ""}</td>
				<td>${this.convertUploadTimeToString(mod.meta.uploadTime)}</td>
				<td class="mods-tab-table-tag-list">
				${
					mod.meta.info.tags
						? mod.meta.info.tags.reduce((acc, tag) => {
								return acc + `<span class="tag">${tag}</span>`;
						  }, "")
						: ""
				}
				</td>
			</tr>
		`
		);

		element.classList.toggle("disabled", mod.isInstalled && !mod.isEnabled);

		element.addEventListener("click", (e) => this.selectMod(mod.modID));

		if (mod.isInstalled) {
			const checkbox = element.querySelector("input[type='checkbox']");
			checkbox.addEventListener("click", (e) => e.stopPropagation());
			checkbox.addEventListener("change", (e) => {
				const checkbox = e.target;
				const isChecked = checkbox.checked;
				checkbox.disabled = true;
				electron.invoke("ml-modloader:set-mod-enabled", { modID: mod.modID, enabled: isChecked }).then((success) => {
					checkbox.disabled = false;
					if (!success) checkbox.checked = !isChecked;
					mod.isEnabled = checkbox.checked;
					element.classList.toggle("disabled", mod.isInstalled && !mod.isEnabled);
				});
			});
		}

		return { element, mod, isVisible: true };
	}

	convertUploadTimeToString(uploadTime) {
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

		getElement("mod-info-title").innerText = mod.meta.info.name;

		if (mod.meta.info.description && mod.meta.info.description.length > 0) {
			getElement("mod-info-description").classList.remove("empty");
			electron.invoke("ml-modloader:render-markdown", mod.meta.info.description).then((html) => {
				getElement("mod-info-description").innerHTML = html;
			});
		} else {
			getElement("mod-info-description").classList.add("empty");
			getElement("mod-info-description").innerText = "No description provided.";
		}

		getElement("mod-info-mod-id").innerText = mod.modID;
		getElement("mod-info-author").innerText = mod.meta.info.author;
		getElement("mod-info-version").innerText = mod.meta.info.version;
		getElement("mod-info-last-updated").innerText = this.convertUploadTimeToString(mod.meta.uploadTime);

		if (mod.meta.info.tags) {
			getElement("mod-info-tags").classList.toggle("empty", mod.meta.info.tags.length === 0);
			if (mod.meta.info.tags.length === 0) {
				getElement("mod-info-tags").innerText = "No tags provided.";
			} else {
				getElement("mod-info-tags").innerHTML = "";
				for (const tag of mod.meta.info.tags) {
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
