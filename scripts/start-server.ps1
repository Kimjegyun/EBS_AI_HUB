## start-server.ps1 — 백엔드 서버(3001) 전용 시작/재시작

$ROOT = Split-Path $PSScriptRoot -Parent

# 1. 3001 포트 점유 프로세스 + 해당 PowerShell 창 모두 종료
function Kill-Port($port) {
    $lines = netstat -ano | Select-String "[ :]:$port\s.*LISTENING"
    foreach ($line in $lines) {
        $pid_ = [int](($line.ToString().Trim() -split '\s+')[-1])
        # 해당 프로세스의 부모(PowerShell 창)도 함께 종료
        try {
            $proc = Get-Process -Id $pid_ -ErrorAction SilentlyContinue
            if ($proc) {
                # 부모 PID 찾기
                $parentId = (Get-CimInstance Win32_Process -Filter "ProcessId=$pid_").ParentProcessId
                Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue
                if ($parentId -and $parentId -ne 0) {
                    $parent = Get-Process -Id $parentId -ErrorAction SilentlyContinue
                    if ($parent -and $parent.Name -like "*powershell*") {
                        Stop-Process -Id $parentId -Force -ErrorAction SilentlyContinue
                    }
                }
            }
        } catch {}
    }
}

Kill-Port 3001
Start-Sleep -Milliseconds 800

# 2. 새 창 시작
Start-Process powershell -ArgumentList '-NoExit','-Command', `
    "`$host.UI.RawUI.WindowTitle='AI-HUB Server :3001'; cd '$ROOT\ai-hub-web\server'; npx tsx watch src/index.ts"

Write-Host "Server started."
