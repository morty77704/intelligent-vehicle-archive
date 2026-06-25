$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$pidFile = Join-Path $PSScriptRoot ".demo-pids.json"

function Start-DemoProcess {
    param(
        [string] $Name,
        [string] $FilePath,
        [string[]] $ArgumentList,
        [string] $WorkingDirectory
    )

    $process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory `
        -PassThru `
        -WindowStyle Hidden

    [pscustomobject]@{
        name = $Name
        id = $process.Id
    }
}

function Wait-Health {
    param(
        [string] $Name,
        [string] $Url
    )

    $deadline = (Get-Date).AddSeconds(30)
    do {
        try {
            Invoke-RestMethod -Uri $Url -TimeoutSec 2 | Out-Null
            Write-Host "$Name ready: $Url"
            return
        } catch {
            Start-Sleep -Milliseconds 500
        }
    } while ((Get-Date) -lt $deadline)

    throw "$Name did not become ready: $Url"
}

if (Test-Path $pidFile) {
    Write-Host "Existing demo PID file found. Run scripts\stop-demo.ps1 first if services are still running."
}

$processes = @()
$processes += Start-DemoProcess "agent-a" "python" @("-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", "8001") (Join-Path $root "agent-a")
$processes += Start-DemoProcess "agent-b" "python" @("-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", "8002") (Join-Path $root "agent-b")
$processes += Start-DemoProcess "agent-c" "python" @("-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", "8003") (Join-Path $root "agent-c")
$processes += Start-DemoProcess "auth" "python" @("-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", "8004") (Join-Path $root "auth")

Wait-Health "Agent A" "http://127.0.0.1:8001/api/vehicle/health"
Wait-Health "Agent B" "http://127.0.0.1:8002/api/plate/health"
Wait-Health "Agent C" "http://127.0.0.1:8003/api/damage/health"
Wait-Health "Auth" "http://127.0.0.1:8004/api/auth/health"

$orchestratorDir = Join-Path $root "orchestrator"
if (-not (Test-Path (Join-Path $orchestratorDir "node_modules"))) {
    Write-Host "Installing orchestrator dependencies..."
    Push-Location $orchestratorDir
    try {
        npm.cmd install
    } finally {
        Pop-Location
    }
}

$processes += Start-DemoProcess "orchestrator" "node" @("server.js") $orchestratorDir

$processes | ConvertTo-Json | Set-Content -Path $pidFile -Encoding UTF8

Write-Host ""
Write-Host "Demo services started."
Write-Host "Open: http://127.0.0.1:8000"
Write-Host "Stop: .\scripts\stop-demo.ps1"
