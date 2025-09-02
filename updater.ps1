# I hate windows so much rn
echo "Downloading update from $($args[0])"
& curl.exe -s $args[0] -o fluxloader-temp
echo "Download complete, waiting for Fluxloader instance to close.."

$parentPid = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId
while (Get-Process -Id $parentPid -ErrorAction SilentlyContinue) {
    Start-Sleep -Seconds 1
}

Remove-Item "Fluxloader-*.exe"
$basename = Split-Path $args[0] -Leaf
Move-Item "fluxloader-temp" $basename