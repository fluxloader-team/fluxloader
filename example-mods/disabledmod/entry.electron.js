modloaderAPI.addPatch("disabledmod", "js/336.bundle.js", {
	type: "replace",
	from: "NONEXISTENTSTRING",
	to: "Some to value",
});

modloaderAPI.events.on("disabledmod", "ml:onModLoaded", () => {
	log("info", "disabledmod", "I have been loaded");
});

modloaderAPI.events.on("disabledmod", "ml:onAllModsLoaded", () => {
	log("info", "disabledmod", "All mods have been loaded");
});

modloaderAPI.events.on("disabledmod", "ml:onModUnloaded", () => {
	log("info", "disabledmod", "I have been loaded");
});

modloaderAPI.events.on("disabledmod", "ml:onSetActive", (isActive) => {
	log("info", "disabledmod", "Set active: " + isActive);
});
