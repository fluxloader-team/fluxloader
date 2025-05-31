fluxloaderAPI.addPatch("js/336.bundle.js", {
	type: "replace",
	from: "Will launch elements upward",
	to: "Will throw some blocks around",
});

const config = fluxloaderAPI.config.get("testmod");

if (config.someSetting) {
	fluxloaderAPI.addPatch("js/bundle.js", {
		type: "replace",
		from: "t.store.resources.artifacts++,",
		to: `$$console.log('You got an artifact, config: ${config.someValue}'),`,
		token: "$$",
	});
}

// fluxloaderAPI.addPatch("js/bundle", {
// 	type: "replace",
// 	from: "dsflkserfoiuewsroiu",
// 	to: `$$`,
// 	token: "$$",
// });

fluxloaderAPI.events.on("fl:mod-loaded", () => {
	log("info", "testmod", "I have been loaded");
});

fluxloaderAPI.events.on("fl:all-mods-loaded", () => {
	log("info", "testmod", "All mods have been loaded");
});

fluxloaderAPI.events.on("fl:game-started", () => {
	log("info", "testmod", "Game is starting");
});

fluxloaderAPI.events.on("fl:mod-unloaded", () => {
	log("info", "testmod", "I have been loaded");
});

log("info", "testmod", "Listening to other envionments");

fluxloaderAPI.handleBrowserIPC("testmod:electronfunc", (event, args) => {
	log("info", "testmod", `electronfunc arguments ${JSON.stringify(args)}`);
	return "This is a response";
});
