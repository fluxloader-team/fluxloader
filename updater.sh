#!/bin/bash
# Updater for mac / linux

echo "Downloading update from $2"
curl -s -L "$2" -o fluxloader-temp

echo "Download complete, closing fluxloader instance..."
kill -9 $1

OS="$(uname -s)"

case "$OS" in
    Linux*)
        echo "Linux finishing touches..."
        
        echo "Removing old exe..."
        rm fluxloader-*.{AppImage,deb}
        
        echo "Renaming new exe..."
        mv fluxloader-temp $(basename $2)
        chmod +x $(basename $2)
    ;;
    Darwin*)
        echo "macOS finishing touches..."
        
        echo "Moving up to parent directory..."
        cd ../../../
        mv fluxloader.app/Contents/MacOS/fluxloader-temp .
        
        echo "Backing up old data..."
        mv fluxloader.app fluxloader-old
        
        echo "Unzipping new version..."
        unzip fluxloader-temp
        rm fluxloader-temp
        
        echo "Deleting old exe..."
        rm -f fluxloader-old/Contents/MacOS/fluxloader
        
        echo "Renaming new exe..."
        mv fluxloader-old/Contents/MacOS/* fluxloader.app/Contents/MacOS
        xattr -cr fluxloader.app
        
        echo "Deleting backed up old data..."
        rm -rf fluxloader-old
    ;;
    *)
        echo "Unknown OS: $OS"
    ;;
esac
