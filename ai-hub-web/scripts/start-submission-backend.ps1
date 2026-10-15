$ErrorActionPreference = 'Stop'
$webDir = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $webDir '.runtime'
$port = 3003
$ready = $false
try { $ready = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/health" -TimeoutSec 2).StatusCode -eq 200 } catch {}
if (-not $ready) {
  $previousPort = $env:PORT
  $previousHost = $env:HOST
  $previousCors = $env:CORS_ORIGIN
  try {
    $origins = @('http://localhost:5173','https://localhost:5173','http://localhost:5174','https://localhost:5174')
    foreach ($name in @('current-tunnel-url.txt', 'public-portals-url.txt')) {
      $file = Join-Path $runtimeDir $name
      if (Test-Path -LiteralPath $file) {
        $origin = (Get-Content -Raw -LiteralPath $file).Trim()
        if ($origin -match '^https://[a-z0-9.-]+$') { $origins += $origin }
      }
    }
    $env:PORT = "$port"
    $env:HOST = '127.0.0.1'
    $env:CORS_ORIGIN = $origins -join ','
    $process = Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'dist/index.js' -WorkingDirectory (Join-Path $webDir 'server') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'backend-submission.out.log') -RedirectStandardError (Join-Path $runtimeDir 'backend-submission.err.log') -PassThru
    [IO.File]::WriteAllText((Join-Path $runtimeDir 'submission-backend.pid'), [string]$process.Id)
  } finally {
    $env:PORT = $previousPort
    $env:HOST = $previousHost
    $env:CORS_ORIGIN = $previousCors
  }
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try { $ready = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/health" -TimeoutSec 2).StatusCode -eq 200 } catch {}
    if ($ready) { break }
    Start-Sleep -Milliseconds 500
  }
}
if (-not $ready) { throw 'Submission backend failed to start. Existing gateway configuration retained.' }
[IO.File]::WriteAllText((Join-Path $runtimeDir 'portal-backend-port.txt'), [string]$port)
Write-Output "Submission backend ready on localhost:$port"
