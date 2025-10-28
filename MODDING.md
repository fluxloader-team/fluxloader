# Fluxloader Modding

This guide explains how to create, structure, and use mods with the **Fluxloader**, a modloader for Sandustry that supports patching and cross-context communication between Electron, Game, and Worker environments.

Above anything in this guide _always consult the sourcecode_ as the final truth.

## Overview

The fluxloader places mods inside the `/mods` folder. The mods are structured as following:

-   A `modinfo.json` metadata file (required)
-   Up to three entrypoints:
    -   `entry.electron.js`
    -   `entry.game.js`
    -   `entry.worker.js`
-   Optional assets, scripts, and config files.

The fluxloader can be configured with `fluxloader-config.json`, and outputs logs to `fluxloader-latest.log` and `fluxloader-previous.log`.

The manager window that opens allows you to manage and control all of this. This includes browsing, installing, and configuring mods,configuring the fluxloader and viewing the logs, changing the load order, and more.

**Example Mod Structure**

```
examplemod/
├── entry.electron.js
├── entry.game.js
├── entry.worker.js
├── modinfo.json
```

## `modinfo.json` Format

This is the manifest used by Fluxloader to load and validate your mod.  
The schema can be found in `src/schema.mod-info.json`. Here is an example:

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

There are 3 "environments" your mod can run in:

-   The fluxloader itself runs inside an `electron` node environment.
-   When the game open its javascript code runs in the `game` environment.
-   The workers are each in a `worker` environment.

Your code will have access to an environment specific `fluxloaderAPI` instance in each.

### Electron Entrypoint (`entry.electron.js`)

Runs in a `vm` context in the Electron main process and can:

-   Patch game files (`addPatch`, `addMappedPatch`, `setPatch`)
-   Listen to loader events
-   Send/receive IPC messages with the game environment
-   Access mod configuration

### Game Entrypoint (`entry.game.js`)

Runs in the renderer process with access to the game runtime. Can:

-   Listen to game / scene load events
-   Send / receive IPC to / from Electron
-   Send / receive messages to / from Workers
-   Read / write mod configuration

### Worker Entrypoint (`entry.worker.js`)

Runs in a game worker thread. Can:

-   React to `fl:worker-initialized`
-   Communicate with the game thread

## Fluxloader API

### Mod Config

Each mod can define a `configSchema` in `modinfo.json`.  
Fluxloader handles storage and schema validation automatically.  
The electron and game provide async access through `fluxloaderAPI.modConfig`.

### Patches

in the `electron` entrypoint mods can modify game files using:

-   `addPatch(file, patchObj)`
-   `setPatch(file, tag, patchObj)`
-   `addMappedPatch(fileMap, mapFn)`
-   `removePatch(file, tag)`

**Example Replace Patch**

```js
{
  type: "replace",
  from: "world",
  to: "hello $",
  token: "$",
}
```

### Events

Each `fluxloaderAPI` defines static events your mods can listen to.  
Find the events declared statically at the top of the environments `fluxloaderAPI`.

**Commonly Used Events**

-   `fl:mod-loaded` (electron)
-   `fl:mod-unloaded` (electron)
-   `fl:all-mods-loaded` (electron)
-   `fl:game-started` (electron)
-   `fl:game-closed` (electron)
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

The worker can only recieve messages after `fl:worker-initialized`. **The worker can still send messages to the game and start listening for messages from the game before this event**.

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
