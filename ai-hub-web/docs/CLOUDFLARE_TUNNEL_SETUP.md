# 무료 Cloudflare Tunnel 기반 재물조사 서버

## 완성 구조

```text
휴대폰/PC 브라우저
        │ HTTPS
        ▼
Vercel 정적 PWA ── HTTPS API ── Cloudflare Tunnel
                                      │ 외부에서 열린 포트 없음
                                      ▼
                             기관 PC 127.0.0.1:3001
                               Express + SQLite
                               Excel + 촬영 사진
```

Cloudflare Tunnel 자체에는 별도 R2/D1 저장 비용이 없습니다. SQLite와 파일은 기관 PC 디스크에
저장됩니다. Tunnel은 기관 PC에서 Cloudflare로 아웃바운드 연결을 생성하므로 공유기 포트포워딩과
휴대폰 CA 인증서가 필요하지 않습니다.

## 반드시 알아야 할 조건

- 고정된 공개 주소를 사용하려면 Cloudflare에 연결된 도메인이 하나 필요합니다.
- 도메인을 이미 보유했다면 Tunnel 사용 자체는 무료로 구성할 수 있습니다.
- 도메인이 없으면 `trycloudflare.com` Quick Tunnel은 사용할 수 있지만 주소가 실행할 때마다
  바뀌므로 Vercel/PWA 운영용으로 적합하지 않습니다.
- 기관 PC가 꺼지거나 절전 모드가 되면 사용자는 로컬 조사를 계속할 수 있지만 서버 동기화는
  PC와 Tunnel이 다시 켜질 때까지 대기합니다.

## 1. Cloudflare에 도메인 연결

1. Cloudflare Dashboard에 로그인합니다.
2. `Websites > Add a domain`에서 보유한 도메인을 추가합니다.
3. 도메인 구입처에서 네임서버를 Cloudflare가 안내한 값으로 변경합니다.
4. Cloudflare Dashboard에서 도메인 상태가 `Active`인지 확인합니다.
5. API용 주소를 정합니다. 예: `inventory-api.example.org`

## 2. 자동 설정

일반 PowerShell에서 실행합니다. `PublicHostname`은 Cloudflare에 등록된 도메인의 하위
도메인이어야 합니다.

```powershell
cd D:\!!__AI_HUB\ai-hub-web

powershell -ExecutionPolicy Bypass -File scripts\setup-cloudflare-tunnel.ps1 `
  -PublicHostname "inventory-api.example.org" `
  -VercelOrigin "https://ebs-ai-hub.vercel.app"
```

스크립트는 다음을 처리합니다.

1. 공식 Windows `cloudflared` 실행 파일을 프로젝트 내부에 다운로드
2. Cloudflare 브라우저 인증
3. `ebs-inventory-api` Named Tunnel 생성 또는 기존 터널 재사용
4. `inventory-api.example.org → http://127.0.0.1:3001` 경로 생성
5. Cloudflare DNS CNAME 자동 생성
6. `server/.env`의 CORS, 공개 URL, JWT, 관리자 코드 설정
7. 관리자 코드와 분리된 현장 PWA 전용 토큰 생성
8. `.env.local`에 Vercel/PWA 연결값 반영

`cloudflared tunnel login`에서 도메인 선택 화면이 나오면 위에서 연결한 도메인을 선택합니다.

## 3. Vercel 환경변수

자동 설정 마지막에 출력된 다음 네 개를 Vercel 프로젝트의
`Settings > Environment Variables`에 등록합니다.

```text
VITE_PUBLIC_URL=https://ebs-ai-hub.vercel.app
VITE_INVENTORY_APP_URL=https://ebs-ai-hub.vercel.app/inventory.html
VITE_INVENTORY_API_URL=https://inventory-api.example.org
VITE_INVENTORY_TOKEN=<자동 생성된 현장 전용 토큰>
```

Production, Preview, Development를 모두 선택하고 저장한 후 Vercel을 Redeploy 합니다.
`VITE_INVENTORY_TOKEN`은 관리자 코드가 아니라 권한이 제한된 현장용 토큰입니다.

## 4. 서버와 Tunnel 실행

```powershell
cd D:\!!__AI_HUB\ai-hub-web
npm run tunnel:start
```

실행 창을 닫으면 Tunnel이 종료됩니다. 자동 시작을 등록하기 전까지 이 창을 유지합니다.

다른 PowerShell에서 연결을 검사합니다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify-tunnel.ps1 `
  -PublicHostname "inventory-api.example.org"
```

## 5. Windows 시작 시 자동 실행

`PowerShell을 관리자 권한으로 실행`한 뒤 다음을 실행합니다.

```powershell
cd D:\!!__AI_HUB\ai-hub-web
powershell -ExecutionPolicy Bypass -File scripts\install-tunnel-startup-task.ps1
```

Windows 작업 스케줄러에 `EBS AI HUB Inventory Tunnel`이 등록됩니다. 부팅 시 Express와
Tunnel을 시작하고 실패하면 1분 간격으로 최대 5회 다시 시작합니다.

## 6. PC 운영 설정

- Windows 전원 설정에서 전원 연결 시 절전 모드를 `안 함`으로 변경합니다.
- `server/data`, `server/uploads`를 기관 백업 대상에 포함합니다.
- 외부에서 3001 포트를 열거나 공유기 포트포워딩을 만들지 않습니다.
- `.env`, `.env.local`, `.cloudflared` 폴더를 메일이나 메신저로 전달하지 않습니다.
- Windows용 cloudflared는 자동 업데이트되지 않으므로 분기별로 버전을 확인합니다.

## 저장 위치

| 자료 | 기관 PC 저장 위치 |
|---|---|
| 사용자·조사 회차·결과 | `server/data/aihub.db` |
| 운영관리부 원본 | `server/uploads/inventory-survey` |
| ERP 원본 | `server/uploads/inventory-erp` |
| 최종 Excel 산출물 | `server/uploads/inventory` |
| 현장 촬영 사진 | `server/uploads/inventory-photos` |

## 장애 확인

- `http://127.0.0.1:3001/health` 실패: Express 서버 또는 `server/.env` 문제
- 로컬 Health 정상, 외부 Health 실패: cloudflared/DNS/기관 방화벽 문제
- 브라우저 CORS 오류: `server/.env`의 `CORS_ORIGIN`과 실제 Vercel 주소 불일치
- Admin 업로드 403: 관리자 로그인이 풀렸거나 Vercel 현장 토큰으로 요청한 상태
- 휴대폰 401: Vercel의 `VITE_INVENTORY_TOKEN`과 `server/.env`의
  `INVENTORY_ACCESS_CODE` 불일치
- PC 재부팅 후 연결 실패: 작업 스케줄러 이력과 `EBS AI HUB Inventory Tunnel` 상태 확인
