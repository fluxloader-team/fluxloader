modloaderAPI.events.on("ml:onMenuLoaded", () => {
	log("info", "testmod", "Menu has been loaded");
});

modloaderAPI.events.on("ml:onGameLoaded", () => {
	log("info", "testmod", "Game has been loaded");
});

log("info", "testmod", "Sending message to other environments");

modloaderAPI.listenWorkerMessage("testmod:browsermsg", (index, message) => {
	log("info", "testmod", `Browser message from ${index}: ${message}`);
});

(async () => {
	const config = await modloaderAPI.config.get("testmod");
	log("info", "testmod", "Config loaded: " + JSON.stringify(config));

	const res = await modloaderAPI.invokeElectronIPC("testmod:electronfunc", { a: "hello", b: 10 });
	log("info", "testmod", "electronfunc response: " + JSON.stringify(res));
})();
