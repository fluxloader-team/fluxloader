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
        cd ../../ # Get back to parent directory where the zip will be unzipped
        mv Fluxloader.app/Contents/MacOS/fluxloader-temp .
        # Backup old data so we can transfer it
        mv Fluxloader.app fluxloader-old
        # Unzip and delete new version
        unzip fluxloader-temp
        rm fluxloader-temp
        # Delete old executable
        rm -f fluxloader-old/Contents/MacOS/Fluxloader
        # Move data from old folder into new one
        mv fluxloader-old/Contents/MacOS/* Fluxloader.app/Contents/MacOS
        rm -rf fluxloader-old
        ;;
    *)
        echo "Unknown OS: $OS"
        ;;
esac