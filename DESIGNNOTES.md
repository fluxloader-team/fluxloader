# Design Notes

## Small changes

-   Better error message on missing file for patches / other (see electrics message)
-   Check that regex patches work with capture groups as expected (and naming scheme is good)
-   Look over `fileManager` access through the `ElectronModloaderAPI`
-   GUI download button horizontal scaling
-   GUI mod info scroll bar hiding behind bottom
-   GUI mod list load more mods button not horizontally scaling - may not be possible
-   GUI do not reload mod list on change tab
-   Full sweep of info / debug logs make sure needed ones are available

## Primary Requirements

-   Install / uninstall mods
-   Integrate mod config GUI
-   Mod info config GUI
-   Modloader config GUI
-   Forward game console to electron (config to enable)
-   Forward electron and game console to GUI
-   Implement VM for mod scripts
-   Custom right click menu (uninstall, enable / disable?)
-   Read markdown file for locally installed mods
-   swapping between versions
-   previewing the action queue
-   filtering on tags
-   Load order GUI + saving
-   CI / CD for packaging into electron
