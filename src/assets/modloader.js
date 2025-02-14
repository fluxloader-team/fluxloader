(async function () {
  /**
   * Creates and initializes the mod loader.
   */
  async function createModLoader() {
    // Unload existing mod loader if it exists
    if (globalThis.modLoader != null) {
      await globalThis.modLoader.unload();
    }

    const modLoader = {};
    modLoader.lastModified = null;

    // Initialize activeMods if not already present
    if (globalThis.activeMods == null) {
      globalThis.activeMods = [];
    }

    modLoader.isLoading = false;

    modLoader.activeMods = [];

    /**
     * Loads all active mods.
     */
    modLoader.loadMods = async function () {
      const mods = await (await fetch("modloader-api/active-mods")).json();
      if (JSON.stringify(modLoader.activeMods) == JSON.stringify(mods)) {
        return;
      }
      modLoader.activeMods = mods;
      for (const modIndex in mods) {
        const mod = await modLoader.loadMod(mods[modIndex]);
        if (mod == null) continue;
        globalThis.activeMods.push(mod);
      }

      for (const mod of globalThis.activeMods) {
        if (mod.modinfo.initialised) {
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(mod, "onLoad")) {
          try {
            mod.onLoad();
          } catch (err) {
            console.error(
              `Error executing onLoad for mod '${mod.modinfo.name}': `,
              err
            );
          }
        }
        mod.modinfo.initialised = true;
      }
    };

    /**
     * Retrieves a mod by its name.
     * @param {string} modName - The name of the mod.
     * @returns {object|null} The mod object or null if not found.
     */
    modLoader.getMod = function (modName) {
      return globalThis.activeMods.find((m) => m.modinfo.id == modName);
    };

    modLoader.unloadMod = async function (modName) {
      const mod = modLoader.getMod(modName);
      if (mod == null) {
        console.error(`Mod '${modName}' not found.`);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(mod, "onUnload")) {
        try {
          mod.onUnload();
        } catch (err) {
          console.error(`Error executing onUnload for mod '${modName}': `, err);
        }
      }
      globalThis.activeMods = globalThis.activeMods.filter(
        (m) => m.modinfo.id !== modName
      );
    };

    /**
     * Loads a mod by its name.
     * @param {{id: string, path: string, name: string}} modName - The name of the mod.
     * @returns {object|null} The loaded mod object or null if failed.
     */
    modLoader.loadMod = async function (mod) {
      const modName = mod.name;
      const existingMod = modLoader.getMod(modName);
      if (existingMod != null) {
        if (mod.id == existingMod.modinfo.version_id) {
          console.log(`Mod '${modName}' already loaded.`);
          return null;
        } else {
          console.log(`Mod '${modName}' has been modified, reloading.`);
          await modLoader.unloadMod(modName);
        }
      }

      if (modName == "modloader") {
        console.error("modloader name is reserved.");
        return null;
      }
      try {
        const response = await fetch(mod.path);
        if (!response.ok) {
          console.error(`Failed to load mod '${modName}'`);
          return null;
        }
        const modScript = await response.text();
        const modExports = {};
        if (modScript.includes("module.exports = ")) {
          const module = { exports: {} };
          const modWrapper = new Function("exports", "module", modScript);
          modWrapper(modExports, module);
          Object.assign(modExports, module.exports);
        } else {
          const modWrapper = new Function("exports", modScript);
          modWrapper(modExports);
        }

        if (modExports.modinfo == null) {
          modExports.modinfo = {};
        }
        modExports.modinfo.version_id = mod.id;
        modExports.modinfo.id = modName;
        modExports.modinfo.initialised = false;
        return modExports;
      } catch (err) {
        console.error(`Error loading mod '${modName}': `, err);
        return null;
      }
    };

    /**
     * Handles key down events.
     * @param {KeyboardEvent} event - The keyboard event.
     */
    modLoader.onKeyDown = function (event) {
      if (event.key === "F1") {
        modLoader.reload(true);
      }
    };

    /**
     * Loads the mod loader and starts watching for changes.
     */
    modLoader.load = async function () {
      await modLoader.loadMods();
      modLoader.eventListener = window.addEventListener(
        "keydown",
        modLoader.onKeyDown
      );

      modLoader.watchInterval = setInterval(() => {
        modLoader.reload();
      }, 1000);

      globalThis.modLoader = modLoader;
    };

    /**
     * Unloads the mod loader and stops watching for changes.
     */
    modLoader.unload = async function () {
      window.removeEventListener("keydown", modLoader.onKeyDown);
      if (modLoader.watchInterval != null) {
        clearInterval(modLoader.watchInterval);
      }
    };

    /**
     * Reloads the mod loader script.
     * @param {boolean} [force=false] - Whether to force reload.
     */
    modLoader.reload = async function (force = false) {
      const response = await fetch("modloader-api/modloader");
      if (!response.ok) {
        console.error(`Failed to load modLoader script`);
        return null;
      }
      const modLoaderScript = await response.text();
      if (!force && globalThis.modLoaderScript === modLoaderScript) {
        await modLoader.loadMods();
        return;
      }
      console.log("Reloading Modloader");
      globalThis.modLoaderScript = modLoaderScript;
      const modLoaderWrapper = new Function("modLoader", modLoaderScript);
      modLoaderWrapper();
    };

    modLoader.watch = async function () {};

    /**
     * Executes functions in the loaded mods based on the game state.
     */
    modLoader.executeModFunctions = async function () {
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
            },
          });
        });
      } else {
        globalThis.gameInstance = window.__debug;
      }

      const scene = gameInstance.state.store.scene.active;
      console.log(
        `Game state loaded with scene ${scene}, starting mod execution.`
      );

      if (scene == 1) {
        for (const mod of globalThis.activeMods) {
          await modLoader.tryExecuteModFunction(mod, "onMenuLoaded");
        }
      } else if (scene == 2 || scene == 3) {
        for (const mod of globalThis.activeMods) {
          await modLoader.tryExecuteModFunction(mod, "onGameLoaded");
        }
      }
    };

    /**
     * Tries to execute a specific function in a mod.
     * @param {object} mod - The mod object.
     * @param {string} functionName - The name of the function to execute.
     */
    modLoader.tryExecuteModFunction = async function (mod, functionName) {
      if (Object.prototype.hasOwnProperty.call(mod, functionName)) {
        try {
          mod[functionName]();
        } catch (err) {
          console.error(
            `Error executing ${functionName} for mod '${mod.modinfo.name}': `,
            err
          );
        }
      } else {
        console.warn(
          `No function '${functionName}' found for mod '${mod.modinfo.name}'.`
        );
      }
    };

    await modLoader.load();
  }

  await createModLoader();
})();
