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

// ---------------- Definitions ----------------

let isPlaying = false;
let isMainButtonLoading = false;
let selectedTab = null;
let allTabs = ["mods", "browse", "config", "console", "options"];

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
	const tbody = modsTable.querySelector("tbody");
	tbody.innerHTML = "";
	for (const mod of mods) {
		const row = createElement(`
			<tr>
				<td><input type="checkbox" ${mod.isEnabled ? "checked" : ""}></td>
				<td>${mod.info.name}</td>
				<td>${mod.info.author}</td>
				<td>${mod.info.version}</td>
				<td>${mod.info.shortDescription}</td>
				<td>N/A</td>
				<td>N/A</td>
			</tr>
		`);
		tbody.appendChild(row);
	}
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

const modsTable = getElement("mods-content-table");
let modsTableColumns = {};

modsTable.querySelectorAll("th").forEach((element) => {
	const column = element.getAttribute("data-column");
	modsTableColumns[column] = { element };
});

document.querySelectorAll(".resizer").forEach(handleResizer);

// ---------------- Driver ----------------

setProgressText("");
setProgress(0);
selectTab("mods");

electron.invoke("ml-modloader:get-mods").then((mods) => {
	console.log("Loaded mods:", mods);
	setMods(mods);
});
