// ---------------- Variables ----------------

let elements = {};
let isPlaying = false;
let isMainButtonLoading = false;

const findElement = (id) => elements[id] = document.getElementById(id);
findElement("main-control-button");

// ---------------- Logic ----------------

elements["main-control-button"].addEventListener("click", () => {
	if (isMainButtonLoading) return;
	isMainButtonLoading = true;

	const mlEvent = isPlaying ? "stop-game" : "start-game";
	elements["main-control-button"].innerText = "Loading...";
	
	electron.invoke(`ml-modloader:${mlEvent}`).then(() => {
		isMainButtonLoading = false;
		isPlaying = !isPlaying;
		elements["main-control-button"].innerText = isPlaying ? "Stop" : "Play";
		elements["main-control-button"].classList.toggle("playing", isPlaying);
	});
});
