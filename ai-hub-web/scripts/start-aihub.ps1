$ErrorActionPreference = 'Stop'
$webDir = Split-Path -Parent $PSScriptRoot
$nodeExe = 'C:\Program Files\nodejs\node.exe'
$serverDir = Join-Path $webDir 'server'
$stateDir = Join-Path $env:TEMP 'ebs-aihub'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$utilityFilesDir = Join-Path $webDir '.utility-files'
New-Item -ItemType Directory -Force -Path $utilityFilesDir | Out-Null

function Test-LocalPort([int]$Port) {
  $client = [Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync('127.0.0.1', $Port)
    return $task.Wait(500) -and $client.Connected
  } catch { return $false }
  finally { $client.Dispose() }
}

# The public portal is a sanitized production build from the current working tree.
Push-Location $webDir
try {
  & $nodeExe 'scripts/render-developer-guide.mjs'
  if ($LASTEXITCODE -ne 0) { throw 'Developer guide rendering failed.' }
  & (Join-Path $PSScriptRoot 'package-developer-kit.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'Developer kit packaging failed.' }
  $previousPortalsOutDir = $env:PORTALS_OUT_DIR
  try {
    $env:PORTALS_OUT_DIR = '.portal-live'
    & $nodeExe 'scripts/build-public-portals.mjs'
  } finally {
    $env:PORTALS_OUT_DIR = $previousPortalsOutDir
  }
  if ($LASTEXITCODE -ne 0) { throw 'Public portal build failed.' }
} finally { Pop-Location }

# Start missing local services and reuse healthy ones.
if (-not (Test-LocalPort 3001)) {
  Start-Process -FilePath $nodeExe -ArgumentList @('node_modules/tsx/dist/cli.mjs','watch','src/index.ts') -WorkingDirectory $serverDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateDir 'backend-dev.out.log') -RedirectStandardError (Join-Path $stateDir 'backend-dev.err.log')
}
$localUserPath = '/user/'
foreach ($portal in @(@{Name='user';Port=5173},@{Name='admin';Port=5174},@{Name='log';Port=5175})) {
  if (Test-LocalPort $portal.Port) {
    if ($portal.Name -eq 'user') { $localUserPath = '/' }
  } else {
    Start-Process -FilePath $nodeExe -ArgumentList @('node_modules/vite/bin/vite.js','--mode',$portal.Name,'--host','127.0.0.1','--port',[string]$portal.Port,'--strictPort') -WorkingDirectory $webDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateDir "$($portal.Name)-dev.out.log") -RedirectStandardError (Join-Path $stateDir "$($portal.Name)-dev.err.log")
  }
}

& (Join-Path $PSScriptRoot 'start-public-portals.ps1')
if ($LASTEXITCODE -ne 0) { throw 'External portal services failed to start.' }

$publicUrlFile = Join-Path $stateDir 'public-portals-url.txt'
$publicUrl = if (Test-Path -LiteralPath $publicUrlFile) { (Get-Content -Raw $publicUrlFile).Trim() } else { 'https://ebs-aihub.com' }
Write-Output 'AI Hub local and public services are running.'
Write-Output "Local USER: https://localhost:5173$localUserPath"
Write-Output 'Local ADMIN: https://localhost:5174/admin/'
Write-Output "Public USER: $publicUrl/user/"
Write-Output "Public ADMIN: $publicUrl/admin/"
