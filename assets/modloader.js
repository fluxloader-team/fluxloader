(async function () {
  async function tryExecuteModFunction(mod, functionName) {
    if (Object.prototype.hasOwnProperty.call(mod, functionName)) {
      try {
        mod[functionName]();
      } catch (err) {
        console.error(`Error executing ${functionName} for mod '${mod.modinfo.name}': `, err);
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
    console.log(`Game state loaded with scene ${scene}, starting mod execution.`);

    if (scene == 1) {
      for (const mod of globalThis.activeMods) {
        await tryExecuteModFunction(mod, "onMenuLoaded");
      }
    } else if (scene == 2 || scene == 3) {
      for (const mod of globalThis.activeMods) {
        await tryExecuteModFunction(mod, "onGameLoaded");
      }
    } 
  }

  async function loadMod(modName) {
    try {
      const response = await fetch(modName);
      if (!response.ok) {
        console.error(`Failed to load mod '${modName}'`);
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

  globalThis.activeMods = [];
  const modPaths = await (await fetch("modloader-api/active-mod-paths")).json();
  for (const modPath of modPaths)
  {
    const mod = await loadMod(modPath);
    if (mod == null) continue;
    globalThis.activeMods.push(mod);
  }

  console.log(`Mods loaded: [${globalThis.activeMods.map((m) => m.modinfo.name).join(", ")}]`);

  await executeModFunctions();

  globalThis.modConfig = {
    get: async (modName) =>{
      try {
        const data = {
          modName: modName,
        }
        const response = await fetch('modloader-api/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          return false;
        }

        return await response.json();
      } catch (error) {
        return null;
      }

    },
    set: async (modName, config) =>{
      try {
        const data = {
          modName: modName,
          config: config,
        }
        const response = await fetch('modloader-api/config', {
          method: 'SET',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data),
        });

        return response.ok;

      } catch (error) {
        return false;
      }
    }
  }
})();
