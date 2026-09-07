$ErrorActionPreference = 'Stop'
$webDir = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $webDir 'server'

$candidates = @(
  (Join-Path $webDir '.cloudflared\cloudflared.exe'),
  'C:\Program Files (x86)\cloudflared\cloudflared.exe',
  'C:\Program Files\cloudflared\cloudflared.exe'
)
$fromPath = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
if ($fromPath) { $candidates += $fromPath.Source }
$cloudflared = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $cloudflared) {
  throw 'cloudflared.exe를 찾지 못했습니다. Cloudflare Tunnel connector를 먼저 설치하세요.'
}

$healthy = $false
try { $healthy = (Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 2).status -eq 'ok' } catch {}
if (-not $healthy) {
  Write-Host '기관 PC Express 서버를 시작합니다.' -ForegroundColor Cyan
  & npm.cmd run build --prefix $serverDir
  if ($LASTEXITCODE -ne 0) { throw 'Express 서버 빌드 실패' }
  Start-Process -FilePath 'node.exe' -ArgumentList 'dist/index.js' -WorkingDirectory $serverDir -WindowStyle Hidden
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try { if ((Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 2).status -eq 'ok') { $healthy = $true; break } } catch {}
  }
}
if (-not $healthy) { throw 'http://127.0.0.1:3001 서버가 응답하지 않습니다.' }

Write-Host "cloudflared: $cloudflared" -ForegroundColor DarkGray
Write-Host 'Quick Tunnel을 시작합니다. 출력되는 https://...trycloudflare.com 주소를 복사하세요.' -ForegroundColor Green
Write-Host '주의: 이 창을 닫거나 다시 실행하면 주소가 변경됩니다.' -ForegroundColor Yellow
& $cloudflared tunnel --url http://127.0.0.1:3001
