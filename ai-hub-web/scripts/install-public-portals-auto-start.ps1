$ErrorActionPreference = 'Stop'
$webDir = Split-Path -Parent $PSScriptRoot
$watchdog = Join-Path $PSScriptRoot 'keep-public-portals-online.ps1'
$taskName = 'EBS AI HUB Public Portals Auto Start'
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $elevated = Start-Process -FilePath 'powershell.exe' -Verb RunAs -PassThru -Wait `
    -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  if ($elevated.ExitCode -ne 0) { throw "Elevated boot task installation failed with exit code $($elevated.ExitCode)." }
  exit 0
}
if (-not (Test-Path -LiteralPath $watchdog)) { throw "Watchdog script missing: $watchdog" }
if (-not (Test-Path -LiteralPath (Join-Path $webDir 'server\dist\index.js'))) {
  throw 'Build the server first with npm run server:build.'
}
$runtimeDir = Join-Path $webDir '.runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchdog`"" `
  -WorkingDirectory $webDir
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
try { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue } catch {}
$bootTrigger = New-ScheduledTaskTrigger -AtStartup
# Wait for Windows networking and user profile services before recovery starts.
$bootTrigger.Delay = 'PT45S'
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName $taskName -Action $action `
  -Trigger @($bootTrigger, $logonTrigger) -Settings $settings -Principal $taskPrincipal `
  -Description 'Starts and monitors the AI Hub public gateway, submission backend and tunnel at Windows boot.' `
  -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'EBS AI HUB Public Portals.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $PSHOME 'powershell.exe'
$shortcut.Arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchdog`""
$shortcut.WorkingDirectory = $webDir
$shortcut.WindowStyle = 7
$shortcut.Description = 'Starts and monitors the AI Hub portal services after sign-in.'
$shortcut.Save()
Start-Sleep -Seconds 3
$taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
[pscustomobject]@{
  taskName = $taskName
  taskState = [string](Get-ScheduledTask -TaskName $taskName).State
  lastRunTime = $taskInfo.LastRunTime.ToString('o')
  lastTaskResult = $taskInfo.LastTaskResult
  installedAt = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $webDir '.runtime\auto-start-status.json') -Encoding utf8
if (-not (Test-Path -LiteralPath $shortcutPath)) { throw 'The sign-in startup shortcut was not created.' }
Write-Output "Boot and sign-in monitoring registered: $taskName (last result $($taskInfo.LastTaskResult)); shortcut: $shortcutPath"
