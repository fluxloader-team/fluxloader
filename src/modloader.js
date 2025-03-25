function clickStartButton() {
	console.log("Starting game...");
	window.electronAPI.startGame();
}

(async () => {
	const startButtonElement = document.getElementById("start-button");
	startButtonElement.addEventListener("click", clickStartButton);

	const mods = await window.electronAPI.getMods();
	console.log(mods);
})();
