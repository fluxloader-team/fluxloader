console.log("Hello world");

(async () => {
    const mods = await window.electron.invoke("ml:get-mods");
    console.log(mods);
})();
