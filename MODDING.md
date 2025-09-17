# Sandustry Fluxloader Modding

This guide explains how to create, structure, and use mods with the **Fluxloader**, a modloader for Sandustry that supports patching and cross-context communication between Electron, Game, and Worker environments.

Above anything in this guide *always consult the sourcecode* as the final truth.

## Mod Structure

Each mod is a directory containing:

-   A `modinfo.json` metadata file (required)
-   Up to three entrypoints:

    -   `entry.electron.js`
    -   `entry.game.js`
    -   `entry.worker.js`

-   Optional assets, scripts, or config files

**Example structure:**

```
examplemod/
├── entry.electron.js
├── entry.game.js
├── entry.worker.js
├── modinfo.json
```

## `modinfo.json` Format

This is the manifest used by Fluxloader to load and validate your mod.  
The schema can be found in `src/schema.mod-info.json`, here is an example:

```json
{
	"modID": "examplemod",
	"name": "Example Mod",
	"version": "1.3.0",
	"author": "tomster12",
	"shortDescription": "Brief summary",
	"description": "Full description",
	"fluxloaderVersion": "^2.0.0",
	"dependencies": {},
	"tags": ["debug"],
	"electronEntrypoint": "entry.electron.js",
	"gameEntrypoint": "entry.game.js",
	"workerEntrypoint": "entry.worker.js",
	"configSchema": {
		"someSetting": {
			"type": "boolean",
			"default": true,
			"description": "Enable feature X"
		},
		"someValue": {
			"type": "number",
			"default": 203
		}
	}
}
```

## Environment Entrypoints

Each environment receives its own Fluxloader API instance:

-   `fluxloaderAPI.environment` is `"electron"`, `"game"`, or `"worker"`

### Electron Entrypoint (`entry.electron.js`)

Runs in a `vm` context in the Electron main process. Can:

-   Patch game files (`addPatch`, `addMappedPatch`, `setPatch`)
-   Listen to loader events
-   Send/receive IPC messages with the game environment
-   Access mod configuration

Example:

```js
fluxloaderAPI.addPatch("js/bundle.js", {
	type: "replace",
	from: "Will launch elements upward",
	to: "Will throw some blocks around",
});

fluxloaderAPI.events.on("fl:mod-loaded", () => {
	log("info", "examplemod", "Mod loaded");
});
```

### Game Entrypoint (`entry.game.js`)

Runs in the renderer process with access to the game runtime. Can:

-   Listen to game / scene load events
-   Send / receive IPC to / from Electron
-   Send / receive messages to / from Workers
-   Read / write mod configuration

Example:

```js
fluxloaderAPI.handleElectronEvent("examplemod:someevent", (_, args) => {
	log("info", "examplemod", "Received from Electron: " + JSON.stringify(args));
});
```

### Worker Entrypoint (`entry.worker.js`)

Runs in a game worker thread. Can:

-   React to `fl:worker-initialized`
-   Communicate with the game thread

Example:

```js
fluxloaderAPI.events.on("fl:worker-initialized", () => {
	fluxloaderAPI.sendGameMessage("examplemod:gamemsg", workerIndex, "Hello!");
});
```

## Fluxloader API

### Mod Config

Each mod can define a `configSchema` in `modinfo.json`. Fluxloader handles storage and schema validation automatically.

The electron and game provide async access through `fluxloaderAPI.modConfig`.

### Patches

Electron mods can modify game files using:

-   `addPatch(file, patchObj)`
-   `setPatch(file, tag, patchObj)`
-   `addMappedPatch(fileMap, mapFn)`
-   `removePatch(file, tag)`

**Example Replace Patch**

```js
{
  type: "replace",
  from: "original string",
  to: "replacement string$$",
  token: "$$",
}
```

### Events

Find the events declared statically at the top of the environments `fluxloaderAPI`.

**Common Events**

-   `fl:mod-loaded`
-   `fl:mod-unloaded`
-   `fl:all-mods-loaded`
-   `fl:game-started`
-   `fl:game-closed`
-   `fl:scene-loaded` (game)
-   `fl:worker-initialized` (worker)

**Use**

```js
fluxloaderAPI.events.on("fl:event-name", handler);
```

## IPC Messaging

Each of these have specific edge cases and usages, if you encounter opposing behavior, please review the source code and report the issue to a developer.
All are asynchronous but not all are awaitable. Be careful with usage.

### Electron -> Game

Only allows one argument when sending. All other IPC messagers allow multiple arguments.

```js
fluxloaderAPI.sendGameEvent("channel", data); // electron
fluxloaderAPI.handleElectronEvent("channel", handler); // game
```

### Game -> Electron

The handler can return a value, this is the only handler that can do so. A promise is returned so it should be awaited.

```js
fluxloaderAPI.invokeElectronIPC("channel", ...args); // game
fluxloaderAPI.handleGameIPC("channel", handler); // electron
```

### Game <-> Worker

The worker can only recieve events after `fl:worker-initialized`, otherwise it is unable to recieve IPC. **It can still send and start listening for IPC messages before this event**.

```js
fluxloaderAPI.sendGameMessage("channel", ...args); // worker
fluxloaderAPI.listenWorkerMessage("channel", handler); // game

fluxloaderAPI.sendWorkerMessage("channel", ...args); // game
fluxloaderAPI.listenGameMessage("channel", handler); // worker
```

## Logging

Use `log(level, modID, message)` where:

-   `level`: `"info"`, `"warn"`, `"error"`
-   `modID`: your mod's ID
