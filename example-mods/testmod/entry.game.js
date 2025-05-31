fluxloaderAPI.events.on("fl:menu-loaded", () => {
	log("info", "testmod", "Menu has been loaded");
});

fluxloaderAPI.events.on("fl:game-loaded", () => {
	log("info", "testmod", "Game has been loaded");
});

log("info", "testmod", "Sending message to other environments");

fluxloaderAPI.listenWorkerMessage("testmod:browsermsg", (index, message) => {
	log("info", "testmod", `Browser message from ${index}: ${message}`);
});

(async () => {
	const config = await fluxloaderAPI.config.get("testmod");
	log("info", "testmod", "Config loaded: " + JSON.stringify(config));

	const res = await fluxloaderAPI.invokeElectronIPC("testmod:electronfunc", { a: "hello", b: 10 });
	log("info", "testmod", "electronfunc response: " + JSON.stringify(res));
})();
