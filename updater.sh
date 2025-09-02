#!/bin/bash
# Updater for mac/linux
echo "Downloading update from $1"
curl -s $1 -o fluxloader-temp
echo "Download complete, waiting for Fluxloader instance to close.."

while kill -0 $PPID 2>/dev/null; do
    sleep 1
done

OS="$(uname -s)"

case "$OS" in
    Linux*)
        echo "Linux finishing touches.."
        rm Fluxloader-*.AppImage
        sleep 1
        mv fluxloader-temp $(basename $1)
        chmod +x $(basename $1)
        ;;
    Darwin*)
        echo "Running macOS updates..."
        brew update
        brew upgrade
        # add more macOS-specific commands here
        ;;
    *)
        echo "Unknown OS: $OS"
        ;;
esac