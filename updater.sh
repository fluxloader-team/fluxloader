#!/bin/bash
# Updater for mac/linux

echo "Downloading update from $2"
curl -s $2 -o fluxloader-temp
echo "Download complete, closing Fluxloader instance.."

kill -9 $1

OS="$(uname -s)"

case "$OS" in
    Linux*)
        echo "Linux finishing touches.."
        rm Fluxloader-*.{AppImage,deb}
        mv fluxloader-temp $(basename $2)
        chmod +x $(basename $2)
        ;;
    Darwin*)
        echo "macOS finishing touches.."
        # Idk what to do here yet
        ;;
    *)
        echo "Unknown OS: $OS"
        ;;
esac