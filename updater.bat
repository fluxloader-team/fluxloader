@REM
@echo off

@REM Generate the ANSI escape code character for custom formatting
for /F "tokens=1,2 delims=#" %%a in ('"prompt #$H#$E# & echo on & for %%b in (1) do rem"') do set ESC=%%b

echo Downloading update from %2...
curl -s -L "%2" -o fluxloader-temp
echo Download complete

echo.
echo Closing fluxloader instance...
taskkill /PID %1 /F
echo Fluxloader closed

echo.
echo Removing old exe...
set /a counter=0
:wait
del fluxloader-*.exe 1>nul 2>nul
C:\Windows\System32\timeout.exe 1 >nul

if exist fluxloader-*.exe (
  set /a counter+=1
  if %counter% geq 10 (
    echo %ESC%[31mFailed to delete old exe after 10 attempts. Please manually rename fluxloader-temp to %~nx2%ESC%[0m
    @REM Delete batch file and exit on fail
    echo Removing updater script...
    goto 2>nul & del "%~f0"
  )
  goto wait
)
echo Old exe removed

echo.
echo Renaming new exe..
move fluxloader-temp "%~nx2" >nul

echo.
echo %ESC%[32mUpdate finished.%ESC%[0m
C:\Windows\System32\timeout.exe 1 >nul
echo Waiting to launch new version and remove updater
pause

echo.
echo Launching fluxloader...
start "" /B "%~nx2"

echo.
echo Removing updater script...
C:\Windows\System32\timeout.exe 1 >nul
goto 2>nul & del "%~f0"