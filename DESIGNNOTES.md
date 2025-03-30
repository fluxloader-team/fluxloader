# v2.0.0 Design Notes

## Notes / TODO

Mod load order saving somehow  

- If mods are added / removed between runs of the modloader this needs updating  
- Probably should use the modloader-config.json  

Modloader window site and IPC

We need some form of IPC between workers and bundle.js

In bundle.js there is a `postAll: function (e, t)` that sends a message to all workers, but it needs an environment variable as param 1
In 336.bundle.js (for example) there is a `self.onmessage = function (e) {` that receives these messages
The environment is initialized inside bundle.js down at the very bottom in variable `s`
I believe it is ready to be used inside the `startManager` function