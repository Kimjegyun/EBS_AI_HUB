@echo off
setlocal
set "REPO_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_DIR%scripts\start-aihub-dev.ps1" -Once
if errorlevel 1 (
  echo AI Hub development servers could not start. Check .runtime\aihub-dev logs.
  pause
  exit /b 1
)
start "AI Hub User" https://localhost:5173/
start "AI Hub Admin" https://localhost:5174/admin/
start "AI Hub Logs" https://localhost:5175/
endlocal
