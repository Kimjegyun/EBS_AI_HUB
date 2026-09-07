[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$PublicHostname,
  [Parameter(Mandatory = $true)][string]$VercelOrigin,
  [string]$TunnelName = 'ebs-inventory-api'
)

$ErrorActionPreference = 'Stop'
$webDir = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $webDir 'server'
$serverEnv = Join-Path $serverDir '.env'
$clientEnv = Join-Path $webDir '.env.local'
$tunnelDir = Join-Path $webDir '.cloudflared'
$cloudflaredExe = Join-Path $tunnelDir 'cloudflared.exe'
$configPath = Join-Path $tunnelDir 'config.yml'

$PublicHostname = $PublicHostname.Trim().ToLowerInvariant().Replace('https://', '').TrimEnd('/')
$VercelOrigin = $VercelOrigin.Trim().TrimEnd('/')
if ($PublicHostname -notmatch '^[a-z0-9][a-z0-9.-]+[a-z0-9]$') { throw 'PublicHostname 형식이 올바르지 않습니다.' }
if ($VercelOrigin -notmatch '^https://[^/]+$') { throw 'VercelOrigin은 https://도메인 형식이어야 합니다.' }

function New-Token([int]$Bytes = 32) {
  $buffer = [byte[]]::new($Bytes)
  [Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  [Convert]::ToBase64String($buffer).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

function Set-EnvValues([string]$Path, [hashtable]$Values) {
  $lines = if (Test-Path -LiteralPath $Path) { [Collections.Generic.List[string]](Get-Content -LiteralPath $Path) } else { [Collections.Generic.List[string]]::new() }
  foreach ($name in $Values.Keys) {
    $newLine = "$name=$($Values[$name])"
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match "^$([regex]::Escape($name))=") { $lines[$i] = $newLine; $found = $true; break }
    }
    if (-not $found) { $lines.Add($newLine) }
  }
  Set-Content -LiteralPath $Path -Value $lines -Encoding utf8
}

function Read-EnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path)) { return '' }
  $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -Last 1
  if ($line) { return $line.Substring($Name.Length + 1).Trim() }
  return ''
}

New-Item -ItemType Directory -Path $tunnelDir -Force | Out-Null
if (-not (Test-Path -LiteralPath $cloudflaredExe)) {
  Write-Host 'cloudflared Windows 64-bit 실행 파일을 내려받습니다.' -ForegroundColor Cyan
  Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cloudflaredExe
}
& $cloudflaredExe --version
if ($LASTEXITCODE -ne 0) { throw 'cloudflared 실행 파일을 실행할 수 없습니다.' }

Write-Host '브라우저에서 Cloudflare 계정과 사용할 도메인을 승인하세요.' -ForegroundColor Yellow
& $cloudflaredExe tunnel login
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare Tunnel 로그인에 실패했습니다.' }

$listJson = & $cloudflaredExe tunnel list --output json
$tunnels = @($listJson | ConvertFrom-Json)
$existing = $tunnels | Where-Object { $_.name -eq $TunnelName } | Select-Object -First 1
if ($existing) {
  $tunnelId = $existing.id
  Write-Host "기존 터널을 사용합니다: $TunnelName ($tunnelId)"
} else {
  $createOutput = & $cloudflaredExe tunnel create $TunnelName 2>&1
  $createOutput | ForEach-Object { Write-Host $_ }
  if (($createOutput -join "`n") -notmatch '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})') { throw '생성된 터널 ID를 찾지 못했습니다.' }
  $tunnelId = $Matches[1]
}

$credentialCandidates = @(
  (Join-Path $env:USERPROFILE ".cloudflared\$tunnelId.json"),
  (Join-Path $env:USERPROFILE ".cloudflare-warp\$tunnelId.json")
)
$credentialPath = $credentialCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $credentialPath) { throw "터널 자격 증명 파일을 찾지 못했습니다: $tunnelId.json" }

$yamlCredential = $credentialPath.Replace('\', '/')
$config = @"
tunnel: $tunnelId
credentials-file: $yamlCredential

ingress:
  - hostname: $PublicHostname
    service: http://127.0.0.1:3001
    originRequest:
      connectTimeout: 30s
      noTLSVerify: false
  - service: http_status:404
"@
Set-Content -LiteralPath $configPath -Value $config -Encoding utf8

Write-Host "Cloudflare DNS에 $PublicHostname 경로를 연결합니다." -ForegroundColor Cyan
& $cloudflaredExe tunnel route dns $TunnelName $PublicHostname
if ($LASTEXITCODE -ne 0) { throw 'DNS 연결에 실패했습니다. 해당 도메인이 Cloudflare에 등록되어 있는지 확인하세요.' }

$jwtSecret = Read-EnvValue $serverEnv 'JWT_SECRET'
if (-not $jwtSecret -or $jwtSecret -eq 'default-secret') { $jwtSecret = New-Token 48 }
$adminCode = Read-EnvValue $serverEnv 'ADMIN_ACCESS_CODE'
if (-not $adminCode) { $adminCode = New-Token 24 }
$inventoryCode = Read-EnvValue $serverEnv 'INVENTORY_ACCESS_CODE'
if (-not $inventoryCode) { $inventoryCode = New-Token 32 }
$origins = "http://localhost:5173,http://localhost:5174,https://localhost:5173,https://localhost:5174,$VercelOrigin"

Set-EnvValues $serverEnv @{
  PORT = '3001'
  HOST = '127.0.0.1'
  CORS_ORIGIN = $origins
  PUBLIC_URL = "https://$PublicHostname"
  JWT_SECRET = $jwtSecret
  ADMIN_ACCESS_CODE = $adminCode
  INVENTORY_ACCESS_CODE = $inventoryCode
}
Set-EnvValues $clientEnv @{
  VITE_PUBLIC_URL = $VercelOrigin
  VITE_INVENTORY_APP_URL = "$VercelOrigin/inventory.html"
  VITE_INVENTORY_API_URL = "https://$PublicHostname"
  VITE_INVENTORY_TOKEN = $inventoryCode
}

Write-Host ''
Write-Host '설정 파일 생성 완료' -ForegroundColor Green
Write-Host "Tunnel config: $configPath"
Write-Host "Local server env: $serverEnv"
Write-Host "Public API: https://$PublicHostname"
Write-Host ''
Write-Host 'Vercel 환경변수에 다음 값을 등록하고 재배포하세요.' -ForegroundColor Yellow
Write-Host "VITE_PUBLIC_URL=$VercelOrigin"
Write-Host "VITE_INVENTORY_APP_URL=$VercelOrigin/inventory.html"
Write-Host "VITE_INVENTORY_API_URL=https://$PublicHostname"
Write-Host "VITE_INVENTORY_TOKEN=$inventoryCode"
Write-Host ''
Write-Host '서버와 터널 실행: npm run tunnel:start' -ForegroundColor Cyan
