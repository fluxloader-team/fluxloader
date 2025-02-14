# HOTLOADER DEMO

This gives an overview of the current hotloading implementation.

## Setup

- Make sure examples\ts-example-mod\.env has the correct mods directory
- Make sure the src\assets\modloader-config.json has the correct executables directory.
- Run npm install
- Run npm run dev
- Go into options and view the debug console.

## modloader.js

- Make a change to the modloader.js, i recommend just adding a random console.log to the async function.
- View the debug console and make sure that is logged out.
- Make another change
- Ensure that is logged out too.

## ts-example-mod

- run npm install in the examples\ts-example-mod directory
- run npm run dev in the examples\ts-example-mod directory
- Increase the version number in the index.ts file
- You should see "Mod 'ts-example-mod' has been modified, reloading." in the console.
- Add a console.log into the mod code, you should see this output in the console.
- Make a change to the console.log and it should also update.
