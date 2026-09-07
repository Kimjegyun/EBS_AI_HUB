# Run this file from an elevated PowerShell after the tunnel has been configured.
$ErrorActionPreference = 'Stop'
$webDir = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $PSScriptRoot 'start-cloudflare-tunnel.ps1'
$taskName = 'EBS AI HUB Inventory Tunnel'

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw '관리자 권한 PowerShell에서 실행해야 합니다.'
}
if (-not (Test-Path -LiteralPath (Join-Path $webDir '.cloudflared\config.yml'))) {
  throw '먼저 setup-cloudflare-tunnel.ps1을 실행하세요.'
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$launcher`"" -WorkingDirectory $webDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "Windows 시작 작업을 등록하고 실행했습니다: $taskName" -ForegroundColor Green
