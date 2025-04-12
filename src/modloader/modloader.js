// ---------------- Definitions ----------------

let elements = {};
let isPlaying = false;
let isMainButtonLoading = false;
let selectedTab = null;
let allTabs = ["mods", "browse", "config", "console", "options"];

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

function setProgress(text, percent) {
	if (text) getElement("progress-bar-text").innerText = text;
	getElement("progress-bar").style.width = `${percent}%`;
}

function selectTab(tab) {
	if (selectedTab) {
		getElement(`tab-${selectedTab}`).classList.remove("selected");
		getElement(`tab-${selectedTab}-content`).style.display = "none";
	}
	selectedTab = tab;
	getElement(`tab-${tab}`).classList.add("selected");
	getElement(`tab-${tab}-content`).style.display = "flex";
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

	if (!isPlaying) getElement("main-control-button").classList.toggle("playing", true);
	electron.invoke(`ml-modloader:${mlEvent}`).then(() => {
		isMainButtonLoading = false;
		isPlaying = !isPlaying;
		getElement("main-control-button").innerText = isPlaying ? "Stop" : "Play";
		getElement("main-control-button").classList.toggle("playing", isPlaying);
	});
});

setProgress("Downloading something...", 0);
selectTab("mods");