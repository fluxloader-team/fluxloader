# v2.0.0 Design Notes

## Notes / To-Do

Mod load order saving

- By default automatic determinstic order based on dependencies
- User can toggle manual load order with warnings

Modloader window site and IPC

Only start the game once mods are loaded

- Events are unavoidably asynchronous
- Go through all code and make sure is the right colour