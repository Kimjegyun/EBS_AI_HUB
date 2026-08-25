## start-vite.ps1 — Vite(5173/5174/5175) 전용 시작/재시작

$ROOT = Split-Path $PSScriptRoot -Parent

# 1. 포트 점유 프로세스 + 부모 PowerShell 창 종료
function Kill-Port($port) {
    $lines = netstat -ano | Select-String "[ :]:$port\s.*LISTENING"
    foreach ($line in $lines) {
        $pid_ = [int](($line.ToString().Trim() -split '\s+')[-1])
        try {
            $parentId = (Get-CimInstance Win32_Process -Filter "ProcessId=$pid_").ParentProcessId
            Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue
            if ($parentId -and $parentId -ne 0) {
                $parent = Get-Process -Id $parentId -ErrorAction SilentlyContinue
                if ($parent -and $parent.Name -like "*powershell*") {
                    Stop-Process -Id $parentId -Force -ErrorAction SilentlyContinue
                }
            }
        } catch {}
    }
}

foreach ($port in @(5173, 5174, 5175)) { Kill-Port $port }
Start-Sleep -Milliseconds 800

# 2. 새 창 3개 시작
Start-Process powershell -ArgumentList '-NoExit','-Command', `
    "`$host.UI.RawUI.WindowTitle='Vite :5173 user';  cd '$ROOT\ai-hub-web'; npx vite --mode user  --host 0.0.0.0 --port 5173 --strictPort"

Start-Process powershell -ArgumentList '-NoExit','-Command', `
    "`$host.UI.RawUI.WindowTitle='Vite :5174 admin'; cd '$ROOT\ai-hub-web'; npx vite --mode admin --host 0.0.0.0 --port 5174 --strictPort"

Start-Process powershell -ArgumentList '-NoExit','-Command', `
    "`$host.UI.RawUI.WindowTitle='Vite :5175 log';   cd '$ROOT\ai-hub-web'; npx vite --mode log   --host 0.0.0.0 --port 5175 --strictPort"

Write-Host "Vite started. (5173 user / 5174 admin / 5175 log)"
