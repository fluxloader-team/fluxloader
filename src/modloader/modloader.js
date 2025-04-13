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
let allTabs = ["mods", "browse", "config", "console", "options"];
let modTableColumns = {};
let modTableRows = [];
let selectedMod = -1;

function setProgressText(text) {
	getElement("progress-bar-text").innerText = text;
}

function setProgress(text, percent) {
	getElement("progress-bar").style.width = `${percent}%`;
}

function selectTab(tab) {
	if (selectedTab) {
		getElement(`tab-${selectedTab}`).classList.remove("selected");
		getElement(`tab-${selectedTab}-content`).style.display = "none";
	}
	selectedTab = tab;
	getElement(`tab-${tab}`).classList.add("selected");
	getElement(`tab-${tab}-content`).style.display = "block";
}

function setMods(mods) {
	const tbody = getElement("mods-content-table").querySelector("tbody");
	tbody.innerHTML = "";
	modTableRows = [];
	let index = 0;
	for (const mod of mods) {
		const element = createElement(`
			<tr>
				<td><input type="checkbox" ${mod.isEnabled ? "checked" : ""}></td>
				<td>${mod.info.name}</td>
				<td>${mod.info.author}</td>
				<td>${mod.info.version}</td>
				<td>${mod.info.shortDescription}</td>
				<td>N/A</td>
				<td class="mods-content-table-tag-list">
				${mod.info.tags ? mod.info.tags.reduce((acc, tag) => {
					return acc + `<span class="tag">${tag}</span>`;
				}, "") : ""}
				</td>
			</tr>
		`);
		tbody.appendChild(element);
		modTableRows.push({ element, mod });
		let rowIndex = index;
		element.addEventListener("click", () => {
			selectMod(rowIndex);
		});
		index += 1;
	}
}

function selectMod(index) {
	if (selectedMod === index) {
		modTableRows[index].element.classList.remove("selected");
		setModInfo(null);
		selectedMod = -1;
		return;
	}
	if (selectedMod !== -1) {
		modTableRows[selectedMod].element.classList.remove("selected");
	}
	selectedMod = index;
	modTableRows[index].element.classList.add("selected");
	setModInfo(modTableRows[index].mod);
}

function setModInfo(mod) {
	if (mod == null) {
		getElement("mod-info").style.display = "none";
		getElement("mod-info-empty").style.display = "block";
	} else {
		getElement("mod-info").style.display = "block";
		getElement("mod-info-empty").style.display = "none";

		getElement("mod-info-title").innerText = mod.info.name;
		
		getElement("mod-info-description").classList.toggle("empty", mod.info.description.length === 0);
		if (mod.info.description.length === 0) {
			getElement("mod-info-description").innerText = "No description provided.";
		} else {
			getElement("mod-info-description").innerText = mod.info.description;
		}

		getElement("mod-info-author").innerText = mod.info.author;
		getElement("mod-info-version").innerText = mod.info.version;
		getElement("mod-info-last-updated").innerText = mod.info.lastUpdated;
		
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

// ---------------- Main ----------------

for (const tab of allTabs) {
	getElement(`tab-${tab}`).addEventListener("click", () => {
		selectTab(tab);
	});
}

getElement("main-control-button").addEventListener("click", () => {
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
});

getElement("mods-content-table")
	.querySelectorAll("th")
	.forEach((element) => {
		const column = element.getAttribute("data-column");
		modTableColumns[column] = { element };
	});

document.querySelectorAll(".resizer").forEach(handleResizer);

setProgressText("");
setProgress(0);
selectTab("mods");

electron.invoke("ml-modloader:get-mods").then((mods) => {
	setMods(mods);
});

getElement("refresh-mods").addEventListener("click", () => {
	electron.invoke("ml-modloader:refresh-mods").then((mods) => {
		console.log(mods);
		setMods(mods);
	});
});
