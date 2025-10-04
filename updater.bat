@REM
@echo off

echo Downloading update from %2
curl -s %2 -o fluxloader-temp
echo Download complete, closing Fluxloader instance..

taskkill /PID %1 /F

echo Removing old exe..

set /a counter=0
:wait
del Fluxloader-*.exe 1>nul
C:\Windows\System32\timeout.exe /t 1 >nul
if exist Fluxloader-*.exe (
  set /a counter+=1
  if %counter% geq 10 (
    echo Failed to delete old exe. Please manually rename fluxloader-temp to %~nx2
    exit /b 1
  )
  goto wait
)

echo Installing new exe..
move fluxloader-temp %~nx2

@REM Remove this file after update is complete
del updater.bat

echo Update complete!
