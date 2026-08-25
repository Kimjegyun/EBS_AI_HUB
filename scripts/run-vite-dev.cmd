@echo off
setlocal
rem scripts\ 의 상위가 프로젝트 루트입니다.
for %%I in ("%~dp0..") do set "AI_HUB_ROOT=%%~fI"
cd /d "%AI_HUB_ROOT%\ai-hub-web"
"C:\Program Files\nodejs\node.exe" "%AI_HUB_ROOT%\ai-hub-web\node_modules\vite\bin\vite.js" --host 0.0.0.0 > "%AI_HUB_ROOT%\vite-dev.log" 2> "%AI_HUB_ROOT%\vite-dev.err.log"
