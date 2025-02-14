# General sandustry-modloader changes

[DONE] Migrated index.js over to typescript
[DONE] npm run dev command so when saving the index.ts it will automatically restart the game
[TODO] Migrate index.ts back to javascript

# index.js

[DONE] is now index.ts // Was done before the ts vs js conversation. Can undo it.
[DONE] will watch the modloader.js file and update the modloaderContent if config.debug.watch == true
[DONE] W

# modloader.js

[DONE] Can be reloaded at any time and won't destroy anything.
[In Progress] When reloaded it will check all mods and see if they have modified. If they have will call exports.onUnload functions and reload them

# ts-example-mod [IN PROGRESS]

## Fast Iterative Development Example

I want this example mod so you can save the mod and it will automatically rerun the code without even needing to restart the game. This sort of approach can make it really fast to mod games.

- Run npm run dev
- Make changes to any ts files
- Build the js files
- Bundle the js files into a single file
- Copy the js file into the mods directory
- modloader.js picks up the mod and loads it.

# ts-unit-test [TODO]

[TODO] Will be another mod that basically will try to run all functionality known. Be based on ts-example-mod.
[TODO] This way we can run this mod and it will verify all api hooks work.
