@echo off
:: 관리자 권한 확인
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo 관리자 권한이 필요합니다. 우클릭 후 "관리자 권한으로 실행"을 선택하세요.
    pause
    exit /b 1
)

echo AI Hub 방화벽 규칙 추가 중...

netsh advfirewall firewall delete rule name="AI Hub Server 3001" >nul 2>&1
netsh advfirewall firewall delete rule name="AI Hub Vite 5173" >nul 2>&1

netsh advfirewall firewall add rule name="AI Hub Server 3001" dir=in action=allow protocol=TCP localport=3001 profile=any
netsh advfirewall firewall add rule name="AI Hub Vite 5173"   dir=in action=allow protocol=TCP localport=5173 profile=any

echo.
echo 완료! 아래 규칙이 추가되었습니다:
netsh advfirewall firewall show rule name="AI Hub Server 3001"
netsh advfirewall firewall show rule name="AI Hub Vite 5173"
echo.
pause
