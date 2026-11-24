$ErrorActionPreference = 'Stop'
$webDir = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $webDir '.runtime'
$resultPath = Join-Path $runtimeDir 'secure-local-restart.json'
try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Windows administrator rights are required.' }
  $listener = Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue
  if ($listener) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
    if ($process.Name -ne 'node.exe' -or $process.CommandLine -notmatch 'dist[\\/]index\.js') { throw 'Local backend identity mismatch; no process stopped.' }
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 5
    if ($health.status -ne 'ok') { throw 'Local backend health identity mismatch.' }
    Stop-Process -Id $process.ProcessId -Force
  }
  $env:NODE_ENV = 'production'
  $env:HOST = '127.0.0.1'
  $env:PORT = '3001'
  Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'dist/index.js' -WorkingDirectory (Join-Path $webDir 'server') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'backend-local.out.log') -RedirectStandardError (Join-Path $runtimeDir 'backend-local.err.log')
  $secured = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    $listener = Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue
    if ($listener -and $listener.LocalAddress -eq '127.0.0.1') { $secured = $true; break }
  }
  if (-not $secured) { throw 'Local backend is not listening on loopback.' }
  @{ ok = $true; port = 3001; bind = '127.0.0.1' } | ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath $resultPath
} catch {
  @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath $resultPath
  exit 1
}
