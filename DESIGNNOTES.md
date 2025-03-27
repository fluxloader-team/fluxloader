# v2.0.0 Design Notes

## General Flow

Initialization:
- Load modloader config of the mods
- Ensure it is allowed / doesn't conflict
- Load the electron entrypoint
  - Each mod here has the chance to register event listeners and patches
- Start modloader window
- User will eventually start the game

Start Game:
- Extract the games app.asar into a temp folder
- Execute the mods patches over the games files
- Run the game electrons main.js

## Thoughts

The mods should be defined in a /modname folder with the following:

- modinfo.json
- entry.electron.js
- entry.browser.js

The different entry points are loaded in the different environments.

We want a modloaderAPI accessible in both electron and browser:

- modloaderAPI.environmentType: "electron" | "browser"
- modloaderAPI.config: .get(), .set()
- modloaderAPI.events: .on()
- modloaderAPI.addPatch()
- modloaderAPI.performPatch()

The mods may want to define additional patches during the menu.
- Think maploader map specific mods, changing files, etc
Simple support for this can be through a { type=overwrite } patch.
To support this we can define the following:

- addPatch()           Add a patch to be performed - to be done in electron environment
- performPatch()       Perform a patch directly and immediately - the patch is not saved
- forceRepatch()       Reload a file to its based form and apply patches
- forceRepatchAll()    forceRepatch() on all patched files
- reloadGameWindow()   forceRepatchAll() then reload index.html
