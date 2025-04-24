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
	rows = [];
	selectedMod = -1;

	setup() {
		getElement("mods-tab-table")
			.querySelectorAll("th")
			.forEach((element) => {
				const column = element.getAttribute("data-column");
				this.columns[column] = { element };
			});
	}

	select() {
		electron.invoke("ml-modloader:get-mods").then((mods) => {
			this.setMods(mods);
		});
	}

	deselect() {}

	setMods(mods) {
		const tbody = getElement("mods-tab-table").querySelector("tbody");
		tbody.innerHTML = "";
		this.rows = [];
		let index = 0;
		for (const mod of mods) {
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

			element.querySelector("input").addEventListener("click", (e) => {
				e.stopPropagation();
			});

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

			let rowIndex = index;
			element.addEventListener("click", (e) => {
				this.selectMod(rowIndex);
			});

			tbody.appendChild(element);
			this.rows.push({ element, mod });
			index += 1;
		}
	}

	selectMod(index) {
		if (this.selectedMod === index) {
			this.rows[index].element.classList.remove("selected");
			this.setModInfo(null);
			this.selectedMod = -1;
			return;
		}
		if (this.selectedMod !== -1) {
			this.rows[this.selectedMod].element.classList.remove("selected");
		}
		this.selectedMod = index;
		this.rows[index].element.classList.add("selected");
		this.setModInfo(this.rows[index].mod);
	}

	setModInfo(mod) {
		if (mod == null) {
			getElement("mod-info").style.display = "none";
			getElement("mod-info-empty").style.display = "block";
		} else {
			getElement("mod-info").style.display = "block";
			getElement("mod-info-empty").style.display = "none";

			getElement("mod-info-title").innerText = mod.info.name;

			getElement("mod-info-description").classList.toggle("empty", mod.info.description ? mod.info.description.length === 0 : true);
			if (mod.info.description && mod.info.description.length > 0) {
				getElement("mod-info-description").innerText = mod.info.description;
			} else {
				getElement("mod-info-description").innerText = "No description provided.";
			}

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
