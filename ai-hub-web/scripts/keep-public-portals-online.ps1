$ErrorActionPreference = 'Stop'
$createdNew = $false
$mutex = [Threading.Mutex]::new($true, 'Local\EbsAiHubPublicPortalsWatchdog', [ref]$createdNew)
if (-not $createdNew) { exit 0 }
$runtimeDir = Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$logPath = Join-Path $runtimeDir 'public-portals-watchdog.log'
try {
  while ($true) {
    try {
      # Run in a child shell because the startup script exits after printing its URL.
      $output = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-public-portals.ps1') 2>&1
      if ($LASTEXITCODE -ne 0) { throw ($output -join [Environment]::NewLine) }
    } catch {
      Add-Content -LiteralPath $logPath -Encoding utf8 -Value "$(Get-Date -Format s) Recovery failed: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 30
  }
} finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
