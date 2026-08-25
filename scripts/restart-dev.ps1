## restart-dev.ps1
## 서버(3001) + Vite(5173/5174/5175) 전체 재시작
## start-server.ps1 + start-vite.ps1 을 순서대로 호출합니다.

$ROOT = Split-Path $PSScriptRoot -Parent

Write-Host "`n서버 재시작 중..." -ForegroundColor Cyan
& "$ROOT\start-server.ps1"
Start-Sleep -Seconds 4

Write-Host "`nVite 재시작 중..." -ForegroundColor Cyan
& "$ROOT\start-vite.ps1"
Start-Sleep -Seconds 8

Write-Host "`n[완료] 실행 중인 서비스:" -ForegroundColor Green
foreach ($port in @(3001, 5173, 5174, 5175)) {
    $line = netstat -ano | Select-String "0\.0\.0\.0:$port\s.*LISTENING" | Select-Object -First 1
    if ($line) {
        $pid_ = ($line.ToString().Trim() -split '\s+')[-1]
        Write-Host "  ✓ 포트 $port (PID $pid_)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ 포트 $port 시작 실패" -ForegroundColor Red
    }
}

Write-Host "`n  PowerShell 창 수: $((Get-Process powershell).Count)" -ForegroundColor Gray
Write-Host ""
