$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$started = @()

function Start-ServiceProcess {
    param(
        [string] $Name,
        [string] $FilePath,
        [string[]] $ArgumentList,
        [string] $WorkingDirectory,
        [hashtable] $Environment = @{}
    )

    $oldValues = @{}
    foreach ($key in $Environment.Keys) {
        $oldValues[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
        [Environment]::SetEnvironmentVariable($key, [string] $Environment[$key], "Process")
    }

    try {
        $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $WorkingDirectory -PassThru -WindowStyle Hidden
        $script:started += [pscustomobject]@{ name = $Name; id = $process.Id }
    } finally {
        foreach ($key in $Environment.Keys) {
            [Environment]::SetEnvironmentVariable($key, $oldValues[$key], "Process")
        }
    }
}

function Wait-Health {
    param([string] $Name, [string] $Url)

    $deadline = (Get-Date).AddSeconds(30)
    do {
        try {
            Invoke-RestMethod -Uri $Url -TimeoutSec 2 | Out-Null
            Write-Host "$Name ready"
            return
        } catch {
            Start-Sleep -Milliseconds 500
        }
    } while ((Get-Date) -lt $deadline)

    throw "$Name did not become ready: $Url"
}

function Wait-Orchestrator {
    $deadline = (Get-Date).AddSeconds(20)
    do {
        try {
            Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/archive" -TimeoutSec 2 | Out-Null
            Write-Host "Orchestrator ready"
            return
        } catch {
            Start-Sleep -Milliseconds 500
        }
    } while ((Get-Date) -lt $deadline)

    throw "Orchestrator did not become ready."
}

function Invoke-Analyze {
    $body = @{
        image = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("demo-image"))
        query = "degraded test"
    } | ConvertTo-Json

    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/analyze" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 30
    return $response.Content
}

try {
    Start-ServiceProcess -Name "agent-a" -FilePath "python" -ArgumentList @("-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", "8001") -WorkingDirectory (Join-Path $root "agent-a")
    Start-ServiceProcess -Name "agent-b" -FilePath "python" -ArgumentList @("-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", "8002") -WorkingDirectory (Join-Path $root "agent-b")

    Wait-Health "Agent A" "http://127.0.0.1:8001/api/vehicle/health"
    Wait-Health "Agent B" "http://127.0.0.1:8002/api/plate/health"

    $orchestratorDir = Join-Path $root "orchestrator"
    if (-not (Test-Path (Join-Path $orchestratorDir "node_modules"))) {
        Push-Location $orchestratorDir
        try {
            npm.cmd install
        } finally {
            Pop-Location
        }
    }

    $degradedEnv = @{
        AGENT_TIMEOUT_MS = "1200"
        AGENT_C_URL = "http://127.0.0.1:8999"
    }
    Start-ServiceProcess -Name "orchestrator" -FilePath "node" -ArgumentList @("server.js") -WorkingDirectory $orchestratorDir -Environment $degradedEnv

    Wait-Orchestrator
    $content = Invoke-Analyze

    $quote = [char] 34
    $failedDamageStep = "$quote" + "tool" + "$quote" + ":" + "$quote" + "assess_condition" + "$quote" + "," + "$quote" + "result" + "$quote" + ":false"
    $reportEvent = "$quote" + "type" + "$quote" + ":" + "$quote" + "report" + "$quote"

    if (-not ($content.Contains($failedDamageStep))) {
        throw "Expected assess_condition to fail in SSE stream."
    }

    if (-not ($content.Contains("[DEGRADED]"))) {
        throw "Expected degraded report warning for missing Agent C."
    }

    if (-not ($content.Contains($reportEvent))) {
        throw "Expected report event even when Agent C is unavailable."
    }

    Write-Host "Degraded integration test passed."
} finally {
    foreach ($item in $started) {
        $process = Get-Process -Id $item.id -ErrorAction SilentlyContinue
        if ($process) {
            Stop-Process -Id $item.id -Force
            Write-Host "Stopped $($item.name) ($($item.id))"
        }
    }

    $archive = Join-Path $root "orchestrator\archive.json"
    if (Test-Path $archive) {
        Remove-Item -LiteralPath $archive -Force
    }
}
