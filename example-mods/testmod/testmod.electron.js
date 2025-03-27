modloaderAPI.addPatch("testmod", "js/bundle.js", {
	// expectedMatches: 1, // Default value
	files: "336.bundle.js",
	type: "replace",
	from: "Will launch elements upward",
	to: "Will throw some blocks around",
});

const config = modloaderAPI.config.get("testmod");

if (config.someSetting) {
	modloaderAPI.addPatch("testmod", "js/bundle.js", {
		// expectedMatches: 1, // Default value
		// file: "bundle.js", // Default value
		type: "replace",
		from: "t.store.resources.artifacts++,",
		to: `t.store.resources.artifacts++,console.log('You got an artifact, config: ${config.someValue}'),`,
	});
}

modloaderAPI.events.on("testmod", "ml:onModLoaded", () => {
	log("info", "testmod", "I have been loaded");
});

modloaderAPI.events.on("testmod", "ml:onAllModsLoaded", () => {
	log("info", "testmod", "All mods have been loaded");
});

modloaderAPI.events.on("testmod", "ml:onModUnloaded", () => {
	log("info", "testmod", "I have been loaded");
});

modloaderAPI.events.on("testmod", "ml:onSetActive", (isActive) => {
	log("info", "testmod", "Set active: " + isActive);
});
