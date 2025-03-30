(async () => {
	const startButtonElement = document.getElementById("start-button");
	
	startButtonElement.addEventListener("click", () => {
		console.log("Starting game...");
		window.electron.invoke("ml:start-game");
	});

	const mods = await window.electron.invoke("ml:get-mods");
	console.log(mods);
})();
