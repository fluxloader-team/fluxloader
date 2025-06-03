# Design Notes

## Small changes

-   Check that regex patches work with capture groups as expected (and naming scheme is good)
-   GUI mod list load more mods button not horizontally scaling - may not be possible
-   Full sweep of info / debug logs make sure needed ones are available
-   Manager window remember which display and window size

## Primary Requirements

-   Listen to file changes for mod config / fluxloader config
-   Install / uninstall mods
-   Mod info config GUI
-   Custom right click menu (uninstall, enable / disable?)
-   Read markdown file for locally installed mods
-   swapping between versions
-   previewing the action queue
-   filtering on tags
-   Load order GUI + saving
-   CI / CD for packaging into electron
