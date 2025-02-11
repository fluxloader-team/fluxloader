(async function () {
    const modsFolder = "../../mods/";
    const modsConfigFile = "mods.json";

    async function loadModsConfig() {
        try {
            const configPath = `${modsFolder}${modsConfigFile}`;
            const response = await fetch(configPath);
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

    function validateMod(mod) {
        if (!mod.modinfo || !mod.modinfo.name || !mod.modinfo.version) {
            console.error(`Invalid mod info for mod: ${mod.modinfo?.name || "unknown"}`);
            return false;
        }
        const dependencies = mod.modinfo?.dependencies || [];
        for (const dependency of dependencies) {
            const [depName, depVersion] = Object.entries(dependency)[0];
            const loadedMod = globalThis.activeMods.find((m) => m.modinfo.name === depName);
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

    async function loadAndValidateMods() {
        const modsToLoad = await loadModsConfig();
        if (modsToLoad.length === 0) {
            console.warn("No mods to load.");
            return;
        }
        globalThis.activeMods = [];
        for (const modName of modsToLoad) {
            const mod = await loadMod(modName);
            if (mod && validateMod(mod)) {
                globalThis.activeMods.push(mod);
            }
        }
        console.log(`Validated ${globalThis.activeMods.length} mod(s): [ ${globalThis.activeMods.map((m) => m.modinfo.name).join(", ")} ]`);
    }

    async function tryExecuteModFunction(mod, functionName) {
        if (Object.prototype.hasOwnProperty.call(mod, functionName)) {
            try {
                mod[functionName]();
            } catch (err) {
                console.error(`Error executing ${functionName} for mod '${mod.modinfo.name}': `, err);
                console.error(`Deactivating mod due to error '${mod.modinfo.name}'.`);
                activeMods = activeMods.filter((m) => m.name !== mod.name);
                tryExecuteModFunction(mod, "deinitialize");
            }
        } else {
            console.warn(`No function '${functionName}' found for mod '${mod.modinfo.name}'.`);
        }
    }
 
    async function executeModFunctions() {
        // Wait for game state before loading anything
        if (!Object.prototype.hasOwnProperty.call(window, "__debug")) {
            await new Promise((resolve) => {
                Object.defineProperty(window, "__debug", {
                    set: (value) => {
                        globalThis.gameInstance = value;
                        resolve();
                    },
                    get: () => {
                        return globalThis.gameInstance;
                    }
                });
            });
        } else {
            globalThis.gameInstance = window.__debug;
        }

        const scene = gameInstance.state.store.scene.active;

        if (scene == 1) {
            for (const mod of globalThis.activeMods) {
                await tryExecuteModFunction(mod, "onMenuLoaded");
            }
        } else if (scene == 3) {
            for (const mod of globalThis.activeMods) {
                await tryExecuteModFunction(mod, "onGameLoaded");
            }
        }
        
    }

    await loadAndValidateMods();
    await executeModFunctions();
})();
