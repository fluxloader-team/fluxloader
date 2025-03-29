modloaderAPI.events.on("testmod", "ml:onMenuLoaded", () => {
	log("info", "testmod", "Menu has been loaded");
});

modloaderAPI.events.on("testmod", "ml:onGameLoaded", () => {
	log("info", "testmod", "Game has been loaded");
});

// const element = document.querySelector("#someUIElement");
// element.addEventListener("click", () => {
// 	modloaderAPI.addPatch("testmod", "map.png", {
// 		type: "overwrite",
// 		with: "my/map/path.png"
// 	});
// 	modloaderAPI.repatchFile("testmod", "map.png");
// });
