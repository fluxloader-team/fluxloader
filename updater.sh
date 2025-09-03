#!/bin/bash
# Updater for mac/linux

echo "Switching to $1"
cd "$1"

echo "Downloading update from $3"
curl -s $3 -o fluxloader-temp
echo "Download complete, closing Fluxloader instance.."

kill -9 $2

OS="$(uname -s)"

case "$OS" in
    Linux*)
        echo "Linux finishing touches.."
        rm Fluxloader-*.{AppImage,deb}
        mv fluxloader-temp $(basename $3)
        chmod +x $(basename $3)
        ;;
    Darwin*)
        echo "macOS finishing touches.."
        # Idk what to do here yet
        ;;
    *)
        echo "Unknown OS: $OS"
        ;;
esac