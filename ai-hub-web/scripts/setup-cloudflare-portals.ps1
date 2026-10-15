[CmdletBinding()]
param(
  # e.g. hub.example.com — a hostname on a domain registered in this Cloudflare account
  [Parameter(Mandatory = $true)][string]$Hostname,
  [string]$TunnelName = 'ebs-ai-hub-portals'
)

# One-time setup: serve the public portal gateway (127.0.0.1:3002: /user/, /admin/,
# /inventory.html, /api/...) on a fixed Cloudflare hostname. Cloudflare Tunnel has
# no request or bandwidth caps, unlike the ngrok free plan it replaces.
# Afterwards scripts/start-public-portals.ps1 runs this tunnel instead of ngrok.
$ErrorActionPreference = 'Stop'
$webDir = Split-Path -Parent $PSScriptRoot
$tunnelDir = Join-Path $webDir '.cloudflared'
$configPath = Join-Path $tunnelDir 'portals.yml'
$hostnamePath = Join-Path $tunnelDir 'portals-hostname.txt'

$cloudflared = @(
  (Join-Path $tunnelDir 'cloudflared.exe'),
  'C:\Program Files (x86)\cloudflared\cloudflared.exe',
  'C:\Program Files\cloudflared\cloudflared.exe'
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $cloudflared) { throw 'cloudflared.exe를 찾지 못했습니다. Cloudflare Tunnel connector를 먼저 설치하세요.' }

$Hostname = $Hostname.Trim().ToLowerInvariant().Replace('https://', '').TrimEnd('/')
if ($Hostname -notmatch '^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$') { throw "주소 형식이 올바르지 않습니다: $Hostname" }
New-Item -ItemType Directory -Path $tunnelDir -Force | Out-Null

# Authorizes this PC for the Cloudflare account and domain (opens a browser once).
if (-not (Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.cloudflared\cert.pem'))) {
  Write-Host '브라우저에서 Cloudflare에 로그인하고, 사용할 도메인을 선택해 승인하세요.' -ForegroundColor Yellow
  & $cloudflared tunnel login
  if ($LASTEXITCODE -ne 0) { throw 'Cloudflare 로그인에 실패했습니다.' }
}

# cloudflared logs warnings (e.g. "version is outdated") to stderr, which Windows
# PowerShell 5.1 turns into terminating errors under 'Stop'. Judge native calls by
# their exit code instead.
$ErrorActionPreference = 'Continue'
# PowerShell 5.1 emits a parsed JSON array as one object; assigning it first lets the
# pipeline enumerate tunnels one by one (the account may hold other tunnels).
$tunnels = & $cloudflared tunnel list --output json 2>$null | Out-String | ConvertFrom-Json
$tunnel = $tunnels | Where-Object { $_.name -eq $TunnelName } | Select-Object -First 1
if ($tunnel) {
  $tunnelId = $tunnel.id
  Write-Host "기존 터널을 사용합니다: $TunnelName ($tunnelId)"
} else {
  $output = & $cloudflared tunnel create $TunnelName 2>&1 | ForEach-Object { "$_" }
  $output | ForEach-Object { Write-Host $_ }
  if ($LASTEXITCODE -ne 0) { throw '터널을 만들지 못했습니다.' }
  if (($output -join "`n") -notmatch '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})') { throw '생성된 터널 ID를 찾지 못했습니다.' }
  $tunnelId = $Matches[1]
}
$credentials = Join-Path $env:USERPROFILE ".cloudflared\$tunnelId.json"
if (-not (Test-Path -LiteralPath $credentials)) { throw "터널 자격 증명 파일이 없습니다: $credentials" }

Set-Content -LiteralPath $configPath -Encoding utf8 -Value @"
tunnel: $tunnelId
credentials-file: $($credentials.Replace('\', '/'))
ingress:
  - hostname: $Hostname
    service: http://127.0.0.1:3002
  - service: http_status:404
"@

Write-Host "Cloudflare DNS에 $Hostname 을 연결합니다." -ForegroundColor Cyan
& $cloudflared tunnel route dns --overwrite-dns $TunnelName $Hostname 2>&1 | ForEach-Object { Write-Host "$_" }
if ($LASTEXITCODE -ne 0) { throw 'DNS 연결에 실패했습니다. 도메인이 이 Cloudflare 계정에 등록되어 있는지 확인하세요.' }
Set-Content -LiteralPath $hostnamePath -Value $Hostname -Encoding utf8

Write-Host ''
Write-Host '설정 완료. 다음 실행부터 ngrok 대신 Cloudflare Tunnel을 사용합니다.' -ForegroundColor Green
Write-Host "  사용자: https://$Hostname/user/"
Write-Host "  관리자: https://$Hostname/admin/"
Write-Host "  재물조사: https://$Hostname/inventory.html"
