(async function () {
    setTimeout(function () {
        try{
            window.__debug.state
        }catch (e){
            document.location.reload();
        }
    },1000)





    const modsFolder = "../../mods/";
    const modsConfigFile = "mods.json";

    async function loadModsConfig() {
        try {
            const response = await fetch(modsFolder + modsConfigFile);
            if (!response.ok) {
                console.error("Failed to load mods.json. Ensure it exists in the mods folder.");
                return [];
            }
            return await response.json();
        } catch (err) {
            console.error("Error loading mods.json: ", err);
            return [];
        }
    }

    async function loadMod(modName) {
        try {
            const modPath = `${modsFolder}${modName}.js`;
            const response = await fetch(modPath);
            if (!response.ok) {
                console.error(`Failed to load mod '${modName}' from ${modPath}.`);
                return null;
            }
            const modScript = await response.text();
            const modExports = {};
            const modWrapper = new Function("exports", modScript);
            modWrapper(modExports);
            return modExports;
        } catch (err) {
            console.error(`Error loading mod '${modName}': `, err);
            return null;
        }
    }

    function validateMod(mod, loadedMods) {
        if (!mod.modinfo || !mod.modinfo.name || !mod.modinfo.version) {
            console.error(`Invalid mod info for mod: ${mod.modinfo?.name || "unknown"}`);
            return false;
        }
        const dependencies = mod.modinfo?.dependencies || [];
        for (const dependency of dependencies) {
            const [depName, depVersion] = Object.entries(dependency)[0];
            const loadedMod = loadedMods.find((m) => m.modinfo.name === depName);
            if (!loadedMod) {
                console.error(`Missing dependency '${depName}' for mod '${mod.modinfo.name}'.`);
                return false;
            }
            if (loadedMod.modinfo.version !== depVersion) {
                console.error(
                    `Version mismatch for dependency '${depName}' in mod '${mod.modinfo.name}'. Expected: ${depVersion}, Found: ${loadedMod.modinfo.version}`
                );
                return false;
            }
        }
        return true;
    }

    async function loadAndInitializeMods() {
        const modsToLoad = await loadModsConfig();
        if (modsToLoad.length === 0) {
            console.warn("No mods to load.");
            return;
        }
        const loadedMods = [];
        for (const modName of modsToLoad) {
            const mod = await loadMod(modName);
            if (mod && validateMod(mod, loadedMods)) {
                loadedMods.push(mod);
            }
        }
        for (const mod of loadedMods) {
            try {
                console.log(`Initializing mod: ${mod.modinfo.name} v${mod.modinfo.version}`);
                mod.main();
            } catch (err) {
                console.error(`Error initializing mod '${mod.modinfo.name}': `, err);
            }
        }
    }

    loadAndInitializeMods();
})();