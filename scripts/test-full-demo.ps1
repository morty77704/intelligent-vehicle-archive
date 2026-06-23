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
    $demoImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgwJ/lKgFJwAAAABJRU5ErkJggg=="
    $body = @{
        image = $demoImage
        query = "full integration test"
    } | ConvertTo-Json

    $timer = [Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/analyze" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 30
    $timer.Stop()

    return [pscustomobject]@{
        Content = $response.Content
        Seconds = [math]::Round($timer.Elapsed.TotalSeconds, 3)
        StatusCode = [int] $response.StatusCode
    }
}

try {
    Start-ServiceProcess -Name "agent-a" -FilePath "python" -ArgumentList @("-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", "8001") -WorkingDirectory (Join-Path $root "agent-a")
    Start-ServiceProcess -Name "agent-b" -FilePath "python" -ArgumentList @("-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", "8002") -WorkingDirectory (Join-Path $root "agent-b")
    Start-ServiceProcess -Name "agent-c" -FilePath "python" -ArgumentList @("-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", "8003") -WorkingDirectory (Join-Path $root "agent-c")

    Wait-Health "Agent A" "http://127.0.0.1:8001/api/vehicle/health"
    Wait-Health "Agent B" "http://127.0.0.1:8002/api/plate/health"
    Wait-Health "Agent C" "http://127.0.0.1:8003/api/damage/health"

    $orchestratorDir = Join-Path $root "orchestrator"
    if (-not (Test-Path (Join-Path $orchestratorDir "node_modules"))) {
        Push-Location $orchestratorDir
        try {
            npm.cmd install
        } finally {
            Pop-Location
        }
    }

    Start-ServiceProcess -Name "orchestrator" -FilePath "node" -ArgumentList @("server.js") -WorkingDirectory $orchestratorDir

    Wait-Orchestrator
    $result = Invoke-Analyze

    if ($result.StatusCode -ne 200) {
        throw "Expected HTTP 200 from /api/analyze, got $($result.StatusCode)."
    }

    $quote = [char] 34
    $requiredTools = @(
        "recognize_vehicle",
        "detect_plate",
        "assess_condition",
        "query_vehicle_params",
        "estimate_market_price",
        "query_plate_info",
        "check_violation",
        "query_vehicle_history",
        "diagnose_damage",
        "estimate_repair",
        "recommend_insurance"
    )

    foreach ($tool in $requiredTools) {
        $successfulStep = "$quote" + "tool" + "$quote" + ":" + "$quote" + $tool + "$quote" + "," + "$quote" + "result" + "$quote" + ":true"
        if (-not ($result.Content.Contains($successfulStep))) {
            throw "Expected successful SSE step for $tool."
        }
    }

    $reportEvent = "$quote" + "type" + "$quote" + ":" + "$quote" + "report" + "$quote"
    $doneEvent = "$quote" + "type" + "$quote" + ":" + "$quote" + "done" + "$quote"
    if (-not ($result.Content.Contains($reportEvent))) {
        throw "Expected report event in SSE stream."
    }
    if (-not ($result.Content.Contains($doneEvent))) {
        throw "Expected done event in SSE stream."
    }
    if ($result.Content.Contains("[DEGRADED]")) {
        throw "Did not expect degraded warning when all agents are available."
    }

    $archive = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/archive" -TimeoutSec 5
    if (-not $archive.data -or $archive.data.Count -lt 1) {
        throw "Expected at least one archived report."
    }

    if ($result.Seconds -ge 15) {
        throw "Expected total response time < 15 seconds, got $($result.Seconds) seconds."
    }

    Write-Host "Full integration test passed in $($result.Seconds) seconds."
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
