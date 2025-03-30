(async () => {
	const startButtonElement = document.getElementById("start-button");
	
	startButtonElement.addEventListener("click", () => {
		console.log("Starting game...");
		window.electronAPI.message("ml:start-game");
	});

	const mods = await window.electronAPI.message("ml:get-mods");
	console.log(mods);
})();
