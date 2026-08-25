$root = Split-Path -Parent $PSScriptRoot
$server = Join-Path $root "server"

# 백엔드 서버 실행 (port 3001)
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$server'; npm run dev"

# 각 모드별 dev 서버를 별도 PowerShell 창으로 실행
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root'; npx vite --mode user --host 0.0.0.0 --port 5173 --strictPort"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root'; npx vite --mode admin --host 0.0.0.0 --port 5174 --strictPort"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root'; npx vite --mode log --host 0.0.0.0 --port 5175 --strictPort"

# 서버가 뜰 때까지 잠시 대기
Write-Host "Dev servers starting... waiting 5 seconds"
Start-Sleep -Seconds 5

# 크롬에서 3개 탭으로 오픈
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (Test-Path $chrome) {
    & $chrome "https://localhost:5173" "https://localhost:5174" "https://localhost:5175"
} else {
    # 기본 브라우저로 fallback
    Start-Process "https://localhost:5173"
    Start-Process "https://localhost:5174"
    Start-Process "https://localhost:5175"
}

Write-Host "Done! Servers running on:"
Write-Host "  Backend -> http://localhost:3001"
Write-Host "  User    -> https://localhost:5173"
Write-Host "  Admin   -> https://localhost:5174"
Write-Host "  Log     -> https://localhost:5175"
