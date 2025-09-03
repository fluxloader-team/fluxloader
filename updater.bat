@REM Updater for windows - This is dumb, but yes it just launches a ps1 file bc I'm tired of this
@echo on

echo Switching to %1
cd "%1"

echo Downloading update from %3
curl -s %3 -o fluxloader-temp
echo Download complete, closing Fluxloader instance..

taskkill /PID %2 /F

echo Removing old exe..
del Fluxloader-*.exe
echo Installing new exe..
move fluxloader-temp %~nx3
