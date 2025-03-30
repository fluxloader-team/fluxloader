modloaderAPI.events.on("testmod", "ml:onMenuLoaded", () => {
	log("info", "testmod", "Menu has been loaded");
});

modloaderAPI.events.on("testmod", "ml:onGameLoaded", () => {
	log("info", "testmod", "Game has been loaded");
});

(async () => {
	const res = await modloaderAPI.sendMessage("testmod:doSomething", { a: "hello", b: 10 });
	console.log("Response: ", res);
})();
