modloaderAPI.addPatch("disabledmod", "js/336.bundle.js", {
	type: "replace",
	from: "NONEXISTENTSTRING",
	to: "Some to value",
});

modloaderAPI.events.on("disabledmod", "ml:onModLoaded", () => {
	log("info", "disabledmod", "I have been loaded");
});

throw new Error("This mod should not be loaded due to this error.");

