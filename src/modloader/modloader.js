(async () => {
	const startButtonElement = document.getElementById("start-button");
	
	startButtonElement.addEventListener("click", () => {
		console.log("Starting game...");
		window.electron.invoke("ml-modloader:start-game");
	});

	const mods = await window.electron.invoke("ml-modloader:get-loaded-mods");
	console.log(mods);
})();
