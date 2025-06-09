# Sandustry Fluxloader

## Notes

Mods are defined in /mods/<modname> and require a 'modinfo.json' file.

Mods are ran inside the (electron), (game) and (worker) environment with their entrypoints files.

Be aware that the following error is related to an experimental feature in the devtools that is not supported by electron.

-   "Request Autofill.enable failed. {"code":-32601,"message":"'Autofill.enable' wasn't found"}", source: devtools://devtools/bundled/core/protocol_client/protocol_client.js (1)

It is deemed not worthy to fix by the electron team and is not a bug in the fluxloader:

-   https://github.com/electron/electron/issues/41614#issuecomment-2006678760
