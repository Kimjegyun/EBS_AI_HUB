$ErrorActionPreference = 'Stop'
$webDir = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $webDir '.runtime'
$stateDir = Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$portalsRoot = Join-Path $webDir '.portal-live'
$gatewayRootMarker = Join-Path $stateDir 'gateway-portals-root.txt'
$gatewayPidMarker = Join-Path $stateDir 'gateway.pid'
$gatewayBuildMarker = Join-Path $stateDir 'gateway-build-id.txt'
$gatewayCodeMarker = Join-Path $stateDir 'gateway-code-hash.txt'
$previousPortalsRoot = if (Test-Path -LiteralPath $gatewayRootMarker) { (Get-Content -Raw $gatewayRootMarker).Trim() } else { '' }
$currentBuildId = ''
$buildVersionFile = Join-Path $portalsRoot 'user/app-version.json'
if (Test-Path -LiteralPath $buildVersionFile) { $currentBuildId = (Get-Content -Raw $buildVersionFile | ConvertFrom-Json).buildId }
$previousBuildId = if (Test-Path -LiteralPath $gatewayBuildMarker) { (Get-Content -Raw $gatewayBuildMarker).Trim() } else { '' }
$currentGatewayCodeHash = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'serve-public-portals.mjs') -Algorithm SHA256).Hash
$previousGatewayCodeHash = if (Test-Path -LiteralPath $gatewayCodeMarker) { (Get-Content -Raw $gatewayCodeMarker).Trim() } else { '' }
if ((($previousPortalsRoot -and $previousPortalsRoot -ne $portalsRoot) -or ($previousBuildId -and $previousBuildId -ne $currentBuildId) -or (-not $previousBuildId -and $previousPortalsRoot) -or ($previousGatewayCodeHash -ne $currentGatewayCodeHash)) -and (Test-Path -LiteralPath $gatewayPidMarker)) {
  $previousGateway = Get-Process -Id ([int](Get-Content -Raw $gatewayPidMarker)) -ErrorAction SilentlyContinue
  if ($previousGateway -and $previousGateway.ProcessName -eq 'node') { Stop-Process -Id $previousGateway.Id -Force; Start-Sleep -Milliseconds 500 }
}
$nodeExe = 'C:\Program Files\nodejs\node.exe'
& (Join-Path $PSScriptRoot 'start-submission-backend.ps1')
& $nodeExe (Join-Path $PSScriptRoot 'ensure-portal-backends.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Application backend recovery failed.' }
$ready = $false
try { $ready = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3002/admin/' -TimeoutSec 2).StatusCode -eq 200 } catch {}
if (-not $ready) {
  $previousPortalBackendPort = $env:PORTAL_BACKEND_PORT
  $previousPortalsRoot = $env:PORTALS_ROOT
  try {
    $env:PORTAL_BACKEND_PORT = '3003'
    $env:PORTALS_ROOT = $portalsRoot
    $gateway = Start-Process -FilePath $nodeExe -ArgumentList 'scripts/serve-public-portals.mjs' -WorkingDirectory $webDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateDir 'portals-gateway.out.log') -RedirectStandardError (Join-Path $stateDir 'portals-gateway.err.log') -PassThru
    Set-Content -LiteralPath $gatewayPidMarker -Value $gateway.Id
    Set-Content -LiteralPath $gatewayRootMarker -Value $portalsRoot
    Set-Content -LiteralPath $gatewayBuildMarker -Value $currentBuildId
    Set-Content -LiteralPath $gatewayCodeMarker -Value $currentGatewayCodeHash
  } finally {
    $env:PORTAL_BACKEND_PORT = $previousPortalBackendPort
    $env:PORTALS_ROOT = $previousPortalsRoot
  }
}

# 1. named   — Cloudflare Tunnel on our own domain, once scripts/setup-cloudflare-portals.ps1 ran (fixed address)
# 2. quick   — Cloudflare Quick Tunnel: no account or caps, but a random address that changes on restart
# 3. ngrok   — only when PORTAL_TUNNEL=ngrok in the repo-root ngrok-token.env (free plan caps 20k requests/month)
$cfConfig = Join-Path $webDir '.cloudflared\portals.yml'
$cfHostname = Join-Path $webDir '.cloudflared\portals-hostname.txt'
$envFile = Join-Path (Split-Path -Parent $webDir) 'ngrok-token.env'
$mode = if ((Test-Path -LiteralPath $cfConfig) -and (Test-Path -LiteralPath $cfHostname)) { 'named' }
  elseif ((Test-Path $envFile) -and (Select-String -LiteralPath $envFile -Pattern '^PORTAL_TUNNEL=ngrok\s*$' -Quiet)) { 'ngrok' }
  else { 'quick' }
$useCloudflare = $mode -ne 'ngrok'
$tunnelProcess = if ($useCloudflare) { 'cloudflared' } else { 'ngrok' }
$modeFile = Join-Path $stateDir 'portals-tunnel.mode'
$runningMode = if (Test-Path $modeFile) { (Get-Content -LiteralPath $modeFile -Raw).Trim() } else { '' }

$pidFile = Join-Path $stateDir 'portals-tunnel.pid'
$existing = if (Test-Path $pidFile) { Get-Process -Id ([int](Get-Content $pidFile)) -ErrorAction SilentlyContinue } else { $null }
$expectedTunnelPattern = if ($mode -eq 'named') { '--config\s+.*portals\.yml' }
  elseif ($useCloudflare) { 'tunnel\s+--url\s+http://127\.0\.0\.1:3002' }
  else { 'ngrok(?:\.exe)?\s+http\s+3002' }
if ($existing) {
  $existingCommand = Get-CimInstance Win32_Process -Filter "ProcessId=$($existing.Id)" -ErrorAction SilentlyContinue
  if ($existing.ProcessName -ne $tunnelProcess -or -not $existingCommand -or $existingCommand.CommandLine -notmatch $expectedTunnelPattern) { $existing = $null }
}
if (-not $existing -or $existing.ProcessName -ne $tunnelProcess -or $runningMode -ne $mode) {
  # Replaces a tunnel of another kind, e.g. ngrok or a Quick Tunnel after the domain is set up.
  if ($existing) { Stop-Process -Id $existing.Id -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500 }
  $logs = @{ RedirectStandardOutput = (Join-Path $stateDir 'portals-tunnel.out.log'); RedirectStandardError = (Join-Path $stateDir 'portals-tunnel.err.log') }
  if ($useCloudflare) {
    $cloudflared = @((Join-Path $webDir '.cloudflared\cloudflared.exe'), 'C:\Program Files (x86)\cloudflared\cloudflared.exe', 'C:\Program Files\cloudflared\cloudflared.exe') |
      Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $cloudflared) { throw 'cloudflared.exe를 찾지 못했습니다.' }
    $tunnelArgs = if ($mode -eq 'named') { @('tunnel', '--config', $cfConfig, '--no-autoupdate', 'run') } else { @('tunnel', '--url', 'http://127.0.0.1:3002', '--no-autoupdate') }
    $tunnel = Start-Process -FilePath $cloudflared -ArgumentList $tunnelArgs -WindowStyle Hidden @logs -PassThru
    $existing = $tunnel
  } else {
    # NGROK_DOMAIN in the gitignored repo-root ngrok-token.env pins the reserved free static domain.
    $ngrokArgs = @('http', '3002', '--log', 'stdout')
    $domainLine = if (Test-Path $envFile) { Get-Content $envFile | Where-Object { $_ -match '^NGROK_DOMAIN=\S' } | Select-Object -Last 1 }
    if ($domainLine) { $ngrokArgs += "--url=$($domainLine.Substring(13).Trim())" }
    $tunnel = Start-Process -FilePath (Get-Command ngrok.exe -ErrorAction Stop).Source -ArgumentList $ngrokArgs -WindowStyle Hidden @logs -PassThru
  }
  Set-Content -LiteralPath $pidFile -Value $tunnel.Id
  Set-Content -LiteralPath $modeFile -Value $mode
}

for ($attempt = 0; $attempt -lt 30; $attempt++) {
  $url = $null
  if ($useCloudflare) {
    $log = Join-Path $stateDir 'portals-tunnel.err.log'
    $text = ''
    if (Test-Path $log) {
      $logText = Get-Content -LiteralPath $log -Raw -ErrorAction SilentlyContinue
      if ($null -ne $logText) { $text = [string]$logText }
    }
    # Wait until the tunnel has registered a connection before announcing its address.
    if ($mode -eq 'named' -and $existing -and (Test-Path -LiteralPath $cfHostname)) {
      $url = 'https://' + (Get-Content -LiteralPath $cfHostname -Raw).Trim()
    } elseif ($text -and $text -match 'Registered tunnel connection') {
      $matches = [regex]::Matches($text, 'https://[a-z0-9-]+\.trycloudflare\.com')
      if ($matches.Count -gt 0) { $url = $matches[$matches.Count - 1].Value }
    }
  } else {
    try { $url = (Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 2).tunnels | Where-Object { $_.public_url -like 'https://*' } | Select-Object -First 1 -ExpandProperty public_url } catch {}
  }
  if ($url) {
    Set-Content -LiteralPath (Join-Path $stateDir 'public-portals-url.txt') -Value $url -Encoding utf8
    & $nodeExe (Join-Path $PSScriptRoot 'ensure-portal-backends.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Application backend recovery failed.' }
    Write-Output "Admin: $url/admin/"
    Write-Output "User: $url/user/"
    exit 0
  }
  Start-Sleep -Milliseconds 500
}
throw "Tunnel URL not ready; inspect $stateDir\portals-tunnel.err.log"
