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
		if (tabs[selectedTab]) tabs[selectedTab].deselect();
	}

	selectedTab = tab;

	getElement(`tab-${tab}`).classList.add("selected");
	getElement(`${tab}-tab-content`).style.display = "block";
	if (tabs[tab]) tabs[tab].select();
}

class ModsTab {
	columns = {};
	modRows = {};
	defaultOrder = [];
	selectedMod = null;
	sortingColumn = null;

	setup() {
		getElement("mods-tab-table")
			.querySelectorAll("th")
			.forEach((element) => {
				const column = element.getAttribute("data-column");
				this.columns[column] = { element, sortingType: 0 };
				element.addEventListener("click", () => {
					this.selectMod(null);
					this.clickColumn(column);
				});
			});
	}

	select() {
		if (this.sortingColumn) this.unselectSortingColumn();

		electron.invoke("ml-modloader:get-mods").then((mods) => {
			this.setMods(mods);
		});
	}

	deselect() {
		// TODO
	}

	setMods(mods) {
		const tbody = getElement("mods-tab-table").querySelector("tbody");
		tbody.innerHTML = "";
		this.modRows = {};
		this.defaultOrder = mods.map((mod) => mod.info.modID);
		let index = 0;
		for (const mod of mods) {
			const row = this.createModRow(mod, index);
			this.modRows[mod.info.modID] = row;
			tbody.appendChild(row.element);
			index += 1;
		}
	}

	createModRow(mod, index) {
		const element = createElement(`
			<tr>
				<td><input type="checkbox" ${mod.isEnabled ? "checked" : ""}></td>
				<td>${mod.info.name}</td>
				<td>${mod.info.author}</td>
				<td>${mod.info.version}</td>
				<td>${mod.info.shortDescription || ""}</td>
				<td>N/A</td>
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
		`);

		element.classList.toggle("disabled", !mod.isEnabled);

		element.querySelector("input").addEventListener("click", (e) => e.stopPropagation());

		element.addEventListener("click", (e) => this.selectMod(mod.info.modID));

		element.querySelector("input").addEventListener("change", (e) => {
			const checkbox = e.target;
			const isChecked = checkbox.checked;
			checkbox.disabled = true;

			electron.invoke("ml-modloader:set-mod-enabled", { name: mod.info.name, enabled: isChecked }).then((success) => {
				checkbox.disabled = false;
				if (!success) checkbox.checked = !isChecked;
				mod.isEnabled = checkbox.checked;
				element.classList.toggle("disabled", !mod.isEnabled);
			});
		});

		return { element, mod, curentIndex: index, isVisible: true };
	}

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

		getElement("mod-info-description").classList.toggle("empty", mod.info.description ? mod.info.description.length === 0 : true);
		if (mod.info.description && mod.info.description.length > 0) {
			getElement("mod-info-description").innerText = mod.info.description;
		} else {
			getElement("mod-info-description").innerText = "No description provided.";
		}

		getElement("mod-info-mod-id").innerText = mod.info.modID;
		getElement("mod-info-author").innerText = mod.info.author;
		getElement("mod-info-version").innerText = mod.info.version;
		getElement("mod-info-last-updated").innerText = mod.info.lastUpdated;

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

	onSearchChanged() {
		// TODO
	}

	onSelectedTagsChanged() {
		// TODO
	}

	updateFilteredMods() {
		// TODO
	}

	clickColumn(column) {
		this.selectSortingColumn(column);
	}

	unselectSortingColumn() {
		if (!this.sortingColumn) return;
		this.columns[this.sortingColumn].sortingType = 0;
		this.columns[this.sortingColumn].element.classList.remove("ascending");
		this.columns[this.sortingColumn].element.classList.remove("descending");
	}

	selectSortingColumn(column) {
		console.log("Sorting mods by column:", column);
		if (this.sortingColumn != column) this.unselectSortingColumn();

		let rows = [];

		// 2 -> 0: Descending -> None
		if (this.columns[column].sortingType === 2) {
			for (const modID of this.defaultOrder) rows.push(this.modRows[modID]);
			this.columns[column].sortingType = 0;
			this.columns[column].element.classList.remove("ascending");
			this.columns[column].element.classList.remove("descending");
			this.sortingColumn = null;
		}

		// 0 -> 1 -> 2: None -> Ascending -> Descending
		else {
			let comparator;
			switch (column) {
				case "name":
					comparator = (a, b) => a.mod.info.name.localeCompare(b.mod.info.name);
					break;
				case "version":
					comparator = (a, b) => a.mod.info.version.localeCompare(b.mod.info.version);
					break;
				case "author":
					comparator = (a, b) => a.mod.info.author.localeCompare(b.mod.info.author);
					break;
				default:
					console.warn("Unknown column:", column);
					return;
			}

			const ascending = this.columns[column].sortingType === 0;
			rows = Object.values(this.modRows);
			rows.sort(comparator);
			if (!ascending) rows.reverse();
			this.columns[column].sortingType = ascending ? 1 : 2;
			this.columns[column].element.classList.toggle("ascending", ascending);
			this.columns[column].element.classList.toggle("descending", !ascending);
			this.sortingColumn = column;
		}

		// Update tbody with sorted rows
		const tbody = getElement("mods-tab-table").querySelector("tbody");
		tbody.innerHTML = "";
		for (let i = 0; i < rows.length; i++) {
			tbody.appendChild(rows[i].element);
			this.modRows[rows[i].mod.info.modID].curentIndex = i;
		}
	}
}

// ---------------- Main ----------------

(() => {
	setupTabs();

	getElement("main-control-button").addEventListener("click", () => handleClickMainButton());

	document.querySelectorAll(".resizer").forEach(handleResizer);

	getElement("refresh-mods").addEventListener("click", () => {
		electron.invoke("ml-modloader:refresh-mods").then((mods) => {
			console.log(mods);
			setMods(mods);
		});
	});

	setProgressText("");
	setProgress(0);
	selectTab("mods");
})();
