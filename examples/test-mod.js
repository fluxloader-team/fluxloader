exports.modinfo = {
    name: "test-mod",
    version: "1.0.0",
    dependencies: [],
    modauthor: "tomster12",
};

exports.onMenuLoaded = function () {
    console.log("test-mod: menu loaded");
};

exports.onGameLoaded = function () {
    console.log(`test-mod: game loaded, game version: ${gameInstance.state.store.version}`);
};

exports.deinitialize = function () {
    console.log("test-mod: deinitialized");
};