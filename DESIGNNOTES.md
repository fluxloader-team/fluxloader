# v2.0.0 Design Notes

## General Flow

Initialization:
- Load modloader config and each of the mods
- Each mod has the chance to register event listeners and patches
- Start modloader window
- User will eventually start the game

Start Game:
- Extract the games app.asar into a temp folder
- Execute the mods patches

## Thoughts

We want a modloaderAPI accessible in both electron and browser:

- modloaderAPI.environmentType: "electron" | "browser"
- modloaderAPI.config: .get(), .set()
- modloaderAPI.events: .on()
- modloaderAPI.addPatch()
- modloaderAPI.performPatch()

The mods may want to define additional patches during the menu.
- Think maploader map specific mods, changing files, etc
Simple support for this can be through a { type=overwrite } patch.
For js replace patches you will likely want to reload the game.

To support this a modloaderAPI.reloadGameWindow() would be useful.