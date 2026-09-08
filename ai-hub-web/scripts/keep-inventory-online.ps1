$ErrorActionPreference = 'Stop'

$createdNew = $false
$watchdogMutex = [Threading.Mutex]::new($true, 'Local\EbsAiHubInventoryWatchdog', [ref]$createdNew)
if (-not $createdNew) { exit 0 }

$webDir = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $webDir 'server'
$runtimeDir = Join-Path $webDir '.runtime'
$nodeExe = 'C:\Program Files\nodejs\node.exe'
$cloudflaredCandidates = @(
  (Join-Path $webDir '.cloudflared\cloudflared.exe'),
  'C:\Program Files (x86)\cloudflared\cloudflared.exe',
  'C:\Program Files\cloudflared\cloudflared.exe'
)
$cloudflaredExe = $cloudflaredCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$watchLog = Join-Path $runtimeDir 'inventory-watchdog.log'
$tunnelOut = Join-Path $runtimeDir 'quick-tunnel.out.log'
$tunnelErr = Join-Path $runtimeDir 'quick-tunnel.err.log'

function Write-WatchLog([string]$message) {
  Add-Content -LiteralPath $watchLog -Value "$(Get-Date -Format s) $message" -Encoding utf8
}

function Test-InventoryServer {
  try {
    return (Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 3).status -eq 'ok'
  } catch {
    return $false
  }
}

function Start-InventoryServer {
  if (-not (Test-Path -LiteralPath $nodeExe)) { throw "Node.js를 찾을 수 없습니다: $nodeExe" }
  if (-not (Test-Path -LiteralPath (Join-Path $serverDir 'dist\index.js'))) {
    throw 'server/dist/index.js가 없습니다. 먼저 npm run server:build를 실행하세요.'
  }
  Start-Process -FilePath $nodeExe -ArgumentList 'dist/index.js' -WorkingDirectory $serverDir -WindowStyle Hidden
  Write-WatchLog 'Express 서버 시작 요청'
}

function Get-QuickTunnelProcess {
  Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'tunnel\s+--url\s+http://127\.0\.0\.1:3001' } |
    Select-Object -First 1
}

function Start-QuickTunnel {
  if (-not $cloudflaredExe) { throw 'cloudflared.exe를 찾을 수 없습니다.' }
  Start-Process -FilePath $cloudflaredExe `
    -ArgumentList @('tunnel', '--url', 'http://127.0.0.1:3001', '--no-autoupdate') `
    -WindowStyle Hidden `
    -RedirectStandardOutput $tunnelOut `
    -RedirectStandardError $tunnelErr
  Write-WatchLog 'Cloudflare Quick Tunnel 시작 요청'
}

function Update-TunnelUrlFile {
  $logFiles = @(
    $tunnelErr,
    (Join-Path $webDir '.cloudflared\quick-tunnel.err.log')
  ) | Where-Object { Test-Path -LiteralPath $_ } | Sort-Object { (Get-Item -LiteralPath $_).LastWriteTime } -Descending

  foreach ($logFile in $logFiles) {
    $match = [regex]::Matches((Get-Content -Raw -LiteralPath $logFile -ErrorAction SilentlyContinue), 'https://[a-z0-9-]+\.trycloudflare\.com') |
      Select-Object -Last 1
    if ($match) {
      $url = $match.Value
      $target = Join-Path $runtimeDir 'current-tunnel-url.txt'
      $previous = if (Test-Path -LiteralPath $target) { (Get-Content -Raw -LiteralPath $target).Trim() } else { '' }
      if ($previous -ne $url) {
        Set-Content -LiteralPath $target -Value $url -Encoding utf8
        $desktop = [Environment]::GetFolderPath('Desktop')
        if ($desktop) {
          Set-Content -LiteralPath (Join-Path $desktop 'EBS 재물조사 외부주소.txt') -Value $url -Encoding utf8
        }
        Write-WatchLog "외부 주소 기록: $url"
      }
      return
    }
  }
}

Write-WatchLog '재물조사 자동 실행 감시 시작'
while ($true) {
  try {
    if (-not (Test-InventoryServer)) {
      Start-InventoryServer
      Start-Sleep -Seconds 5
    }
    if ((Test-InventoryServer) -and -not (Get-QuickTunnelProcess)) {
      Start-QuickTunnel
    }
    Update-TunnelUrlFile
  } catch {
    Write-WatchLog "자동 복구 실패: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 30
}
