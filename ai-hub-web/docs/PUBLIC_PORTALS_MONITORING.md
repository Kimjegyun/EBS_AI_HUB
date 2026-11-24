# AI Hub 공개 포털 자동 시작 및 상태 확인

`npm run portals:autostart`를 한 번 실행하고 Windows 관리자 승인을 완료하면 작업 스케줄러가 SYSTEM 계정으로 포털 감시기를 부팅 시 시작합니다. 네트워크가 늦게 올라오거나 서비스가 중단되어도 감시기가 30초 간격으로 복구를 시도합니다. 작업은 로그인 전에도 동작합니다.

기존 로그인 시작 항목인 `EBS-AI-HUB-Inventory.cmd`도 인벤토리 감시기를 시작하며, 인벤토리 감시기는 공개 포털 감시기의 상태 기록이 90초 이상 오래된 경우 이를 다시 실행합니다. 따라서 부팅 작업을 설치하지 못한 경우에도 Windows 로그인 후 자동 시작과 감시기 재시도가 동작합니다.

감시기는 공개 게이트웨이(`127.0.0.1:3002/admin/`), 제출 백엔드(`127.0.0.1:3003/health`), Cloudflare/ngrok 프로세스를 확인하고 `.runtime/public-portals-status.json`에 결과를 씁니다. 감시기가 90초 넘게 상태를 갱신하지 않으면 상태 조회에서 오래된 상태로 표시됩니다.

```powershell
npm run portals:status
```

복구 및 실행 로그는 `.runtime/public-portals-watchdog.log`, `.runtime/portals-gateway*.log`, `.runtime/portals-tunnel*.log`, `.runtime/backend-submission*.log`에 저장됩니다. 작업 스케줄러 작업 이름은 `EBS AI HUB Public Portals Auto Start`입니다.

부팅 작업 설치에는 Windows 관리자 권한이 필요합니다. 기존 `.runtime` 상태 파일과 서버 데이터는 지우지 않습니다.
