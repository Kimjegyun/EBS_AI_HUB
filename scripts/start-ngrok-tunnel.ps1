## start-ngrok-tunnel.ps1
## ngrok으로 3001 포트를 외부에 공개하고,
## 발급된 공개 URL을 .env.local에 자동 업데이트한 뒤 Vite를 재시작합니다.

# ngrok 실행 파일 — PATH의 ngrok 우선, 없으면 WinGet 경로
$NGROK_EXE = "ngrok"

$ROOT      = Split-Path $PSScriptRoot -Parent
$ENVFILE   = "$ROOT\ai-hub-web\.env.local"
$ADMIN_CODE = ""  # ADMIN_ACCESS_CODE (server/.env의 값) — 비워두면 대화식으로 입력

# ── 1. authtoken — 서버 API 복호화 조회 ──────────────────────────────────────
if ($ADMIN_CODE -eq "") {
    $ADMIN_CODE = Read-Host "ADMIN_ACCESS_CODE를 입력하세요 (server/.env의 ADMIN_ACCESS_CODE)"
}

Write-Host "`n[1] 서버에서 ngrok 토큰 조회 중..." -ForegroundColor Cyan
$NGROK_TOKEN = ""
try {
    $resp = Invoke-RestMethod `
        -Uri "http://localhost:3001/api/inventory/ngrok-token" `
        -Headers @{ Authorization = "Bearer $ADMIN_CODE" } `
        -ErrorAction Stop
    if ($resp.ok) { $NGROK_TOKEN = $resp.token }
} catch {
    Write-Host "  서버 토큰 조회 실패: $_" -ForegroundColor Yellow
}

if ($NGROK_TOKEN -eq "") {
    Write-Host ""
    Write-Host "======================================================" -ForegroundColor Yellow
    Write-Host " 저장된 ngrok 토큰을 찾을 수 없습니다." -ForegroundColor Yellow
    Write-Host " Admin > 재물조사 > 설정 탭에서 먼저 토큰을 저장하세요." -ForegroundColor Cyan
    Write-Host "======================================================" -ForegroundColor Yellow
    $NGROK_TOKEN = Read-Host "또는 지금 직접 입력하세요"
}

Write-Host "`n[2] ngrok authtoken 등록 중..." -ForegroundColor Cyan
& $NGROK_EXE config add-authtoken $NGROK_TOKEN
if ($LASTEXITCODE -ne 0) { Write-Host "authtoken 등록 실패" -ForegroundColor Red; exit 1 }

# ── 3. 3001 터널 시작 (백그라운드) ──────────────────────────────────────────
Write-Host "[3] ngrok 터널 시작 (포트 3001)..." -ForegroundColor Cyan
$ngrokJob = Start-Process $NGROK_EXE -ArgumentList "http 3001 --log=stdout" -PassThru -WindowStyle Minimized

# API가 뜰 때까지 대기
Start-Sleep -Seconds 3

# ── 4. 공개 URL 가져오기 ─────────────────────────────────────────────────────
Write-Host "[4] 공개 URL 확인 중..." -ForegroundColor Cyan
$maxRetry = 10
$publicUrl = $null
for ($i = 0; $i -lt $maxRetry; $i++) {
    try {
        $tunnels = Invoke-RestMethod "http://localhost:4040/api/tunnels" -ErrorAction Stop
        $publicUrl = ($tunnels.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1).public_url
        if ($publicUrl) { break }
    } catch {}
    Start-Sleep -Seconds 2
}

if (-not $publicUrl) {
    Write-Host "ngrok URL을 가져올 수 없습니다. ngrok 상태를 확인하세요." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host " 공개 URL: $publicUrl" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green

# ── 5. .env.local 업데이트 ──────────────────────────────────────────────────
Write-Host "[5] .env.local 업데이트 중..." -ForegroundColor Cyan
$installUrl = "$publicUrl/install"
$envContent = Get-Content $ENVFILE -Raw

if ($envContent -match "VITE_INVENTORY_APP_URL=") {
    $envContent = $envContent -replace "VITE_INVENTORY_APP_URL=.*", "VITE_INVENTORY_APP_URL=$installUrl"
} else {
    $envContent += "`nVITE_INVENTORY_APP_URL=$installUrl"
}
Set-Content $ENVFILE -Value $envContent.TrimEnd() -NoNewline
Write-Host "  VITE_INVENTORY_APP_URL=$installUrl" -ForegroundColor Green

# ── 6. Vite 5173/5174 재시작 ────────────────────────────────────────────────
Write-Host "[6] Vite 서버 재시작 중..." -ForegroundColor Cyan
foreach ($port in @(5173, 5174)) {
    $line = (netstat -ano | Select-String "0\.0\.0\.0:$port\s+0\.0\.0\.0:0\s+LISTENING" | Select-Object -First 1)
    if ($line) {
        $pid_ = ($line.ToString().Trim() -split '\s+')[-1]
        Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue
        Write-Host "  포트 $port 프로세스 종료"
    }
}
Start-Sleep -Milliseconds 600
Start-Process powershell -ArgumentList '-NoExit','-Command',"cd '$ROOT\ai-hub-web'; npx vite --mode user  --host 0.0.0.0 --port 5173 --strictPort"
Start-Process powershell -ArgumentList '-NoExit','-Command',"cd '$ROOT\ai-hub-web'; npx vite --mode admin --host 0.0.0.0 --port 5174 --strictPort"

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host " 완료! 폰에서 아래 URL로 접속하세요:" -ForegroundColor Green
Write-Host "  $installUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host " 또는 User 모드 재물조사 위젯의 QR을 찍으세요." -ForegroundColor Green
Write-Host " (Vite 재시작 후 약 5초 뒤 QR이 새 URL로 업데이트됩니다)" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host ""
Write-Host " ngrok 웹 대시보드: http://localhost:4040" -ForegroundColor Gray
Write-Host " 터널 종료: 이 창을 닫거나 ngrok 프로세스를 종료하세요." -ForegroundColor Gray
Write-Host ""
Read-Host "Enter 누르면 종료 (ngrok 터널은 계속 실행됩니다)"
