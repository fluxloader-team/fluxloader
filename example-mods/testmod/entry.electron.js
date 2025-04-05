modloaderAPI.addPatch("js/336.bundle.js", {
	type: "replace",
	from: "Will launch elements upward",
	to: "Will throw some blocks around",
});

const config = modloaderAPI.config.get("testmod");

if (config.someSetting) {
	modloaderAPI.addPatch("js/bundle.js", {
		type: "replace",
		from: "t.store.resources.artifacts++,",
		to: `t.store.resources.artifacts++,console.log('You got an artifact, config: ${config.someValue}'),`,
	});
}

modloaderAPI.events.on("ml:onModLoaded", () => {
	log("info", "testmod", "I have been loaded");
});

modloaderAPI.events.on("ml:onAllModsLoaded", () => {
	log("info", "testmod", "All mods have been loaded");
});

modloaderAPI.events.on("ml:onGameStarted", () => {
	log("info", "testmod", "Game is starting");
});

modloaderAPI.events.on("ml:onModUnloaded", () => {
	log("info", "testmod", "I have been loaded");
});

log("info", "testmod", "Listening to other envionments");

modloaderAPI.handleBrowserIPC("testmod:electronfunc", (event, args) => {
	log("info", "testmod", `electronfunc arguments ${JSON.stringify(args)}`);
	return "This is a response";
});
