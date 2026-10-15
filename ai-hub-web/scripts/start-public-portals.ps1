$ErrorActionPreference = 'Stop'
$webDir = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $webDir '.runtime'
$nodeExe = 'C:\Program Files\nodejs\node.exe'
& (Join-Path $PSScriptRoot 'start-submission-backend.ps1')
$ready = $false
try { $ready = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3002/admin/' -TimeoutSec 2).StatusCode -eq 200 } catch {}
if (-not $ready) {
  Start-Process -FilePath $nodeExe -ArgumentList 'scripts/serve-public-portals.mjs' -WorkingDirectory $webDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'portals-gateway.out.log') -RedirectStandardError (Join-Path $runtimeDir 'portals-gateway.err.log')
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
$modeFile = Join-Path $runtimeDir 'portals-tunnel.mode'
$runningMode = if (Test-Path $modeFile) { (Get-Content -LiteralPath $modeFile -Raw).Trim() } else { '' }

$pidFile = Join-Path $runtimeDir 'portals-tunnel.pid'
$existing = if (Test-Path $pidFile) { Get-Process -Id ([int](Get-Content $pidFile)) -ErrorAction SilentlyContinue } else { $null }
if (-not $existing -or $existing.ProcessName -ne $tunnelProcess -or $runningMode -ne $mode) {
  # Replaces a tunnel of another kind, e.g. ngrok or a Quick Tunnel after the domain is set up.
  if ($existing) { Stop-Process -Id $existing.Id -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500 }
  $logs = @{ RedirectStandardOutput = (Join-Path $runtimeDir 'portals-tunnel.out.log'); RedirectStandardError = (Join-Path $runtimeDir 'portals-tunnel.err.log') }
  if ($useCloudflare) {
    $cloudflared = @((Join-Path $webDir '.cloudflared\cloudflared.exe'), 'C:\Program Files (x86)\cloudflared\cloudflared.exe', 'C:\Program Files\cloudflared\cloudflared.exe') |
      Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $cloudflared) { throw 'cloudflared.exe를 찾지 못했습니다.' }
    $tunnelArgs = if ($mode -eq 'named') { @('tunnel', '--config', $cfConfig, '--no-autoupdate', 'run') } else { @('tunnel', '--url', 'http://127.0.0.1:3002', '--no-autoupdate') }
    $tunnel = Start-Process -FilePath $cloudflared -ArgumentList $tunnelArgs -WindowStyle Hidden @logs -PassThru
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
    $log = Join-Path $runtimeDir 'portals-tunnel.err.log'
    $text = if (Test-Path $log) { [string](Get-Content -LiteralPath $log -Raw) } else { '' }
    # Wait until the tunnel has registered a connection before announcing its address.
    if ($text -match 'Registered tunnel connection') {
      $url = if ($mode -eq 'named') { 'https://' + (Get-Content -LiteralPath $cfHostname -Raw).Trim() }
        else { ([regex]::Matches($text, 'https://[a-z0-9-]+\.trycloudflare\.com') | Select-Object -Last 1).Value }
    }
  } else {
    try { $url = (Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 2).tunnels | Where-Object { $_.public_url -like 'https://*' } | Select-Object -First 1 -ExpandProperty public_url } catch {}
  }
  if ($url) {
    Set-Content -LiteralPath (Join-Path $runtimeDir 'public-portals-url.txt') -Value $url -Encoding utf8
    Write-Output "Admin: $url/admin/"
    Write-Output "User: $url/user/"
    exit 0
  }
  Start-Sleep -Milliseconds 500
}
throw 'Tunnel URL not ready; inspect .runtime/portals-tunnel.err.log'
