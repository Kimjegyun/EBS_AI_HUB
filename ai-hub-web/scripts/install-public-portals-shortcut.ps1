$ErrorActionPreference = 'Stop'
$webDir = Split-Path -Parent $PSScriptRoot
$watchdog = Join-Path $PSScriptRoot 'keep-public-portals-online.ps1'
$startupDir = [Environment]::GetFolderPath('Startup')
if (-not $startupDir) { throw 'Current user Startup directory is unavailable.' }
if (-not (Test-Path -LiteralPath $watchdog)) { throw "Watchdog script missing: $watchdog" }
$shortcutPath = Join-Path $startupDir 'EBS AI HUB Public Portals.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $PSHOME 'powershell.exe'
$shortcut.Arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchdog`""
$shortcut.WorkingDirectory = $webDir
$shortcut.WindowStyle = 7
$shortcut.Description = 'Start and monitor EBS AI HUB public portals after Windows sign-in.'
$shortcut.Save()
if (-not (Test-Path -LiteralPath $shortcutPath)) { throw 'Startup shortcut was not created.' }
Start-Process -FilePath $shortcut.TargetPath -ArgumentList $shortcut.Arguments -WorkingDirectory $webDir -WindowStyle Hidden
Write-Output "Public portal startup shortcut created: $shortcutPath"
