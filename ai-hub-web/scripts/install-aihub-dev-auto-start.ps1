$ErrorActionPreference = 'Stop'
$webDir = Split-Path -Parent $PSScriptRoot
$watchdog = Join-Path $PSScriptRoot 'start-aihub-dev.ps1'
$taskName = 'EBS AI HUB Development Servers'
if (-not (Test-Path -LiteralPath $watchdog)) { throw "Development watchdog missing: $watchdog" }
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Node.js is required and must be on PATH.' }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchdog`"" `
  -WorkingDirectory $webDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Keeps the EBS AI HUB local development servers running; Vite HMR and tsx watch apply code changes.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 3
$task = Get-ScheduledTask -TaskName $taskName
$info = Get-ScheduledTaskInfo -TaskName $taskName
Write-Output "Registered current-user logon task: $taskName; state=$($task.State); last result=$($info.LastTaskResult)"
