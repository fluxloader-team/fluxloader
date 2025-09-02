@REM Updater for windows

echo Downloading update from %1
curl -s %1 -o fluxloader-temp
echo Download complete, closing Fluxloader instance..

taskkill /PID %2 /F

echo Removing old exe..
del Fluxloader-*.exe
echo Installing new exe..
move fluxloader-temp %~nx1
