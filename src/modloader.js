(async () => {
    const mods = await window.electronAPI.getMods();
    console.log(mods);
})();
