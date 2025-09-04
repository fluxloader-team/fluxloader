@REM Updater for windows - This is dumb, but yes it just launches a ps1 file bc I'm tired of this
@echo off

echo Downloading update from %2
curl -s %2 -o fluxloader-temp
echo Download complete, closing Fluxloader instance..

taskkill /PID %1 /F

echo Removing old exe..

:wait
del Fluxloader-*.exe 1>nul
timeout /t 1 >nul
if exist Fluxloader-*.exe goto wait

echo Installing new exe..
move fluxloader-temp %~nx2

@REM Remove this file after update is complete
del updater.bat

echo Update complete!