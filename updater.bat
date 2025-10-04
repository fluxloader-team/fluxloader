@REM
@echo off

echo Downloading update from %2
curl -s %2 -o fluxloader-temp

echo Download complete, closing Fluxloader instance...
taskkill /PID %1 /F

echo Removing old exe...
set /a counter=0
:wait
del fluxloader-*.exe 1>nul 2>nul
C:\Windows\System32\timeout.exe /t 1 >nul

if exist fluxloader-*.exe (
  set /a counter+=1
  if %counter% geq 10 (
    echo Failed to delete old exe. Please manually rename fluxloader-temp to %~nx2
    exit /b 1
  )
  goto wait
)

echo Installing new exe..
move fluxloader-temp %~nx2

echo Removing self...
del updater.bat 1>nul 2>nul
