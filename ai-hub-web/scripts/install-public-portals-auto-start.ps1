$ErrorActionPreference = 'Stop'
$watchdog = Join-Path $PSScriptRoot 'keep-public-portals-online.ps1'
$webDir = Split-Path -Parent $PSScriptRoot
$startupDir = [Environment]::GetFolderPath('Startup')
if (-not $startupDir) { throw 'Current user Startup directory is unavailable.' }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $startupDir 'EBS AI HUB Public Portals.lnk'))
$shortcut.TargetPath = Join-Path $PSHOME 'powershell.exe'
$shortcut.Arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchdog`""
$shortcut.WorkingDirectory = $webDir
$shortcut.WindowStyle = 7
$shortcut.Description = 'Start and recover EBS USER and ADMIN external access after Windows sign-in.'
$shortcut.Save()
Start-Process -FilePath $shortcut.TargetPath -ArgumentList $shortcut.Arguments -WorkingDirectory $webDir -WindowStyle Hidden
Write-Output 'Public portal recovery enabled now and at Windows sign-in.'
