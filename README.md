# Sandustry Flux Modloader

## TODO

### Small changes

- Better error message on missing file for patches / other (see electrics message)
- Check that regex patches work with capture groups as expected (and naming scheme is good)
- Look over `fileManager` access through the `ElectronModloaderAPI`
- GUI download button horizontal scaling
- GUI mod info scroll bar hiding behind bottom
- GUI mod list load more mods button not horizontally scaling - may not be possible
- GUI do not reload mod list on change tab

### Primary Requirements

- Install / uninstall mods
- Integrate mod config GUI
- Mod info config GUI
- Modloader config GUI
- Forward game console to electron (config to enable)
- Forward electron and game console to GUI
- Implement VM for mod scripts
