modloaderAPI.events.on("testmod", "ml:onMenuLoaded", () => {
	log("info", "testmod", "Menu has been loaded");
});

modloaderAPI.events.on("testmod", "ml:onGameLoaded", () => {
	log("info", "testmod", "Game has been loaded");
});

(async () => {
	const config = await modloaderAPI.config.get("testmod");
	log("info", "testmod", "Config loaded: " + JSON.stringify(config));

	const res = await modloaderAPI.sendMessage("electron", "testmod:doSomething", { a: "hello", b: 10 });
	log("info", "testmod", "Response: " + res);
})();
