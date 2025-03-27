modloaderAPI.events.on("testmod", "ml:onMenuLoaded", () => {
	log("info", "testmod", "Menu has been loaded");
});

modloaderAPI.events.on("testmod", "ml:onGameLoaded", () => {
	log("info", "testmod", "Game has been loaded");
});

const element = document.querySelector("#someUIElement");

element.addEventListener("click", () => {
	modloaderAPI.performPatch("testmod", {
		file: "map.png",
		type: "overwrite",
		target: "my/map/path.png",
	});
});
