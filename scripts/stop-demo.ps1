$ErrorActionPreference = "Stop"

$pidFile = Join-Path $PSScriptRoot ".demo-pids.json"

if (-not (Test-Path $pidFile)) {
    Write-Host "No demo PID file found."
    return
}

$processes = Get-Content -Raw -Path $pidFile | ConvertFrom-Json
foreach ($item in $processes) {
    $process = Get-Process -Id $item.id -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Id $item.id -Force
        Write-Host "Stopped $($item.name) ($($item.id))"
    } else {
        Write-Host "$($item.name) already stopped ($($item.id))"
    }
}

Remove-Item -LiteralPath $pidFile -Force
Write-Host "Demo services stopped."

