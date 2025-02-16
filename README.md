# Sandustry Modloader

Sandustry modloader is a open source tool which allows for easy access to modifying Sandustry with user defined JavaScript mods.

There is support for patches to overwrite sections of the games `bundle.js`, arbitrary JavaScript code execution that can make use of `gameInstance` exposed by the game, and custom API endpoints for interception of network requests and serverside execution of JavaScript.

If you need further help ask **@shadowdev** or **@tomster12** in the Sandustry discord!

## Install Modloader

To install the modloader download `mod-loader.exe` from one of the following links:

- **Latest Stable Release**: https://git.rendezvous.dev/shadowcomputer/sandustry-modloader/-/releases/permalink/latest
- **Latest Dev Builds**: https://git.rendezvous.dev/shadowcomputer/sandustry-modloader/-/artifacts

Then place the exe alongside `sandustrydemo.exe` in your steam install location:

<img src="site/modloader-location.png" alt="drawing" width="450"/>

## Downloading Mods

When you first run `mod-loader.exe` it will produce a `mods` folder.  
To install mods, copy any `mod.js` file into this folder.  
This should be enough for them to work!

## Build Modloader

Alternatively you can build the `mod-loader.exe` yourself. The source code is readily available to clone from this repo:

```bash
git clone https://git.rendezvous.dev/shadowcomputer/sandustry-modloader.git
```

Then ensure you have nodejs installed ([download](https://nodejs.org/en/download)), and perform the following inside the modloader folder:

```bash
npm i -g pkg
pkg . --targets win --output "mod-loader.exe"
```

This will produce a `mod-loader.exe` file which you can put in the steam folder as shown above.


## Creating Mods

See https://git.rendezvous.dev/shadowcomputer/sandustry-modloader/-/wikis/Creating-Mods.
