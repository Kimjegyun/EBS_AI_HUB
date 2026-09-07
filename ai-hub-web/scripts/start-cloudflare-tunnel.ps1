$ErrorActionPreference = 'Stop'
$webDir = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $webDir 'server'
$tunnelDir = Join-Path $webDir '.cloudflared'
$cloudflaredExe = Join-Path $tunnelDir 'cloudflared.exe'
$configPath = Join-Path $tunnelDir 'config.yml'

if (-not (Test-Path -LiteralPath $cloudflaredExe)) { throw '먼저 npm run tunnel:setup을 실행하세요.' }
if (-not (Test-Path -LiteralPath $configPath)) { throw 'Cloudflare Tunnel config.yml이 없습니다.' }
if (-not (Test-Path -LiteralPath (Join-Path $serverDir '.env'))) { throw 'server/.env가 없습니다.' }

Write-Host 'Express 서버를 빌드합니다.' -ForegroundColor Cyan
& npm.cmd run build --prefix $serverDir
if ($LASTEXITCODE -ne 0) { throw '서버 빌드 실패' }

$healthOk = $false
try { $healthOk = (Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 2).status -eq 'ok' } catch {}
if (-not $healthOk) {
  Write-Host 'Express + SQLite 서버를 시작합니다.' -ForegroundColor Cyan
  Start-Process -FilePath 'node.exe' -ArgumentList 'dist/index.js' -WorkingDirectory $serverDir -WindowStyle Hidden
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try { if ((Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 2).status -eq 'ok') { $healthOk = $true; break } } catch {}
  }
}
if (-not $healthOk) { throw 'Express 서버가 3001 포트에서 시작되지 않았습니다. server/logs를 확인하세요.' }

Write-Host 'Cloudflare Tunnel을 시작합니다. 이 창을 닫으면 외부 동기화가 중단됩니다.' -ForegroundColor Green
& $cloudflaredExe tunnel --config $configPath run
