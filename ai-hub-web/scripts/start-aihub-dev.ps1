param([switch]$Once)

$ErrorActionPreference = 'Stop'
$webDir = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $webDir 'server'
$runtimeDir = Join-Path $webDir '.runtime\aihub-dev'
$node = (Get-Command node.exe -ErrorAction Stop).Source
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

function Test-LocalPort([int]$Port) {
  $client = [Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync('127.0.0.1', $Port)
    return $task.Wait(500) -and $client.Connected
  } catch { return $false }
  finally { $client.Dispose() }
}

function Start-Service([string]$Name, [string]$Directory, [string[]]$Arguments, [int]$Port) {
  if (Test-LocalPort $Port) { return }
  $stdout = Join-Path $runtimeDir "$Name.out.log"
  $stderr = Join-Path $runtimeDir "$Name.err.log"
  Start-Process -FilePath $node -ArgumentList $Arguments -WorkingDirectory $Directory `
    -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null
}

function Start-AiHubServices {
  Start-Service 'backend' $serverDir @('node_modules/tsx/dist/cli.mjs', 'watch', 'src/index.ts') 3001
  Start-Service 'user' $webDir @('node_modules/vite/bin/vite.js', '--mode', 'user', '--host', '127.0.0.1', '--port', '5173', '--strictPort') 5173
  Start-Service 'admin' $webDir @('node_modules/vite/bin/vite.js', '--mode', 'admin', '--host', '127.0.0.1', '--port', '5174', '--strictPort') 5174
  Start-Service 'log' $webDir @('node_modules/vite/bin/vite.js', '--mode', 'log', '--host', '127.0.0.1', '--port', '5175', '--strictPort') 5175
}

if ($Once) {
  Start-AiHubServices
  exit 0
}

$createdNew = $false
$mutex = [Threading.Mutex]::new($true, 'Local\EbsAiHubDevelopmentWatchdogV1', [ref]$createdNew)
if (-not $createdNew) { exit 0 }
try {
  while ($true) {
    Start-AiHubServices
    Start-Sleep -Seconds 10
  }
} finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
