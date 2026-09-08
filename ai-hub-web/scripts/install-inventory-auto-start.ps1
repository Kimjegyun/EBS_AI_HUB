$ErrorActionPreference = 'Stop'

$webDir = Split-Path -Parent $PSScriptRoot
$watchdog = Join-Path $PSScriptRoot 'keep-inventory-online.ps1'
$taskName = 'EBS AI HUB Inventory Auto Start'

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw '관리자 권한 PowerShell에서 실행해야 합니다.'
}
if (-not (Test-Path -LiteralPath $watchdog)) { throw "감시 스크립트가 없습니다: $watchdog" }
if (-not (Test-Path -LiteralPath (Join-Path $webDir 'server\dist\index.js'))) {
  throw '서버 빌드 파일이 없습니다. 먼저 npm run server:build를 실행하세요.'
}

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchdog`"" `
  -WorkingDirectory $webDir
$triggers = @(
  (New-ScheduledTaskTrigger -AtStartup),
  (New-ScheduledTaskTrigger -AtLogOn)
)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $triggers `
  -Settings $settings `
  -Principal $taskPrincipal `
  -Description 'EBS AI HUB 재물조사 Express 서버와 Cloudflare Tunnel을 자동 실행하고 복구합니다.' `
  -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Start-Sleep -Seconds 2
$task = Get-ScheduledTask -TaskName $taskName
$info = Get-ScheduledTaskInfo -TaskName $taskName
$runtimeDir = Join-Path $webDir '.runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
[pscustomobject]@{
  taskName = $task.TaskName
  state = [string]$task.State
  lastTaskResult = $info.LastTaskResult
  installedAt = (Get-Date).ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeDir 'auto-start-status.json') -Encoding utf8
Write-Host "자동 실행 등록 완료: $($task.TaskName) / 상태 $($task.State) / 결과 $($info.LastTaskResult)" -ForegroundColor Green
