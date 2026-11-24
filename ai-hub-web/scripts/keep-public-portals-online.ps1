$ErrorActionPreference = 'Stop'
$createdNew = $false
$mutex = [Threading.Mutex]::new($true, 'Local\EbsAiHubPublicPortalsWatchdogV2', [ref]$createdNew)
if (-not $createdNew) { exit 0 }
$runtimeDir = Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$logPath = Join-Path $runtimeDir 'public-portals-watchdog.log'
$statusPath = Join-Path $runtimeDir 'public-portals-status.json'
$status = [ordered]@{
  state = 'starting'
  checkedAt = [DateTime]::UtcNow.ToString('o')
  watchdogPid = $PID
  lastRecoveryAt = $null
  lastError = $null
  publicUrl = $null
  gateway = 'unknown'
  submissionBackend = 'unknown'
  tunnel = 'unknown'
}
function Save-Status {
  $status.checkedAt = [DateTime]::UtcNow.ToString('o')
  $tmp = "$statusPath.tmp"
  [IO.File]::WriteAllText($tmp, ($status | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $tmp -Destination $statusPath -Force
}
function Test-HttpEndpoint([string]$Url) {
  try { return (Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 4).StatusCode -eq 200 } catch { return $false }
}
function Test-TunnelProcess {
  $pidPath = Join-Path $runtimeDir 'portals-tunnel.pid'
  $modePath = Join-Path $runtimeDir 'portals-tunnel.mode'
  if (-not (Test-Path -LiteralPath $pidPath) -or -not (Test-Path -LiteralPath $modePath)) { return $false }
  $process = Get-Process -Id ([int](Get-Content -Raw $pidPath)) -ErrorAction SilentlyContinue
  if (-not $process) { return $false }
  $mode = (Get-Content -Raw $modePath).Trim()
  $expectedName = if ($mode -eq 'ngrok') { 'ngrok' } else { 'cloudflared' }
  return $process.ProcessName -eq $expectedName
}
Save-Status
try {
  while ($true) {
    try {
      $gatewayHealthy = Test-HttpEndpoint 'http://127.0.0.1:3002/admin/'
      $backendHealthy = Test-HttpEndpoint 'http://127.0.0.1:3003/health'
      $tunnelHealthy = Test-TunnelProcess
      if (-not ($gatewayHealthy -and $backendHealthy -and $tunnelHealthy)) {
        $status.state = 'recovering'
        Save-Status
        # Run in a child so a slow application recovery cannot stop status heartbeats.
        $stdout = Join-Path $runtimeDir 'portals-recovery.out.log'
        $stderr = Join-Path $runtimeDir 'portals-recovery.err.log'
        $child = Start-Process -FilePath 'powershell.exe' `
          -ArgumentList "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'start-public-portals.ps1')`"" `
          -WorkingDirectory (Split-Path -Parent $PSScriptRoot) -WindowStyle Hidden `
          -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
        $deadline = [DateTime]::UtcNow.AddMinutes(3)
        while (-not $child.HasExited -and [DateTime]::UtcNow -lt $deadline) {
          if ($child.WaitForExit(5000)) { break }
          $status.state = 'recovering'
          Save-Status
        }
        if (-not $child.HasExited) {
          Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue
          throw 'Service recovery exceeded 3 minutes; the watchdog will retry after checking service health.'
        }
        if ($child.ExitCode -ne 0) {
          $detail = if (Test-Path $stderr) { Get-Content -Raw $stderr } else { '' }
          throw "Recovery exited with code $($child.ExitCode). $detail"
        }
        $status.lastRecoveryAt = [DateTime]::UtcNow.ToString('o')
        $status.lastError = $null
      }
    } catch {
      $message = $_.Exception.Message
      if ($message.Length -gt 1200) { $message = $message.Substring(0, 1200) }
      $status.lastError = $message
      Add-Content -LiteralPath $logPath -Encoding utf8 -Value "$(Get-Date -Format s) Recovery failed: $message"
    }
    $status.gateway = if (Test-HttpEndpoint 'http://127.0.0.1:3002/admin/') { 'healthy' } else { 'unhealthy' }
    $status.submissionBackend = if (Test-HttpEndpoint 'http://127.0.0.1:3003/health') { 'healthy' } else { 'unhealthy' }
    $status.publicUrl = if (Test-Path -LiteralPath (Join-Path $runtimeDir 'public-portals-url.txt')) { (Get-Content -Raw (Join-Path $runtimeDir 'public-portals-url.txt')).Trim() } else { $null }
    $status.tunnel = if (Test-TunnelProcess) { 'running' } else { 'stopped' }
    $status.state = if ($status.gateway -eq 'healthy' -and $status.submissionBackend -eq 'healthy' -and $status.tunnel -eq 'running') { 'healthy' } else { 'degraded' }
    Save-Status
    Start-Sleep -Seconds 30
  }
} finally {
  $status.state = 'stopped'
  Save-Status
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
