#!/bin/bash
# Updater for mac/linux
echo "Downloading update from $1"
curl -s $1 -o fluxloader-temp
echo "Download complete, closing Fluxloader instance.."

kill -9 $2

OS="$(uname -s)"

case "$OS" in
    Linux*)
        echo "Linux finishing touches.."
        rm Fluxloader-*.{AppImage,deb}
        mv fluxloader-temp $(basename $1)
        chmod +x $(basename $1)
        ;;
    Darwin*)
        echo "macOS finishing touches.."
        # Idk what to do here yet
        ;;
    *)
        echo "Unknown OS: $OS"
        ;;
esac