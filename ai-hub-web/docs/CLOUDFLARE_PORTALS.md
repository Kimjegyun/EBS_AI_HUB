# 외부 포털 고정 주소 (Cloudflare Tunnel)

외부 포털 게이트웨이(127.0.0.1:3002: `/user/`, `/admin/`, `/inventory.html`, `/api/...`)를 내 도메인으로 공개합니다.

ngrok 무료 플랜을 대체합니다. ngrok 무료는 월 HTTP 요청 2만 건까지만 허용합니다. 이 앱은 기기마다 30~60초 간격으로 자동 동기화를 하므로 그 한도를 금방 넘습니다.

| | ngrok 무료 | Cloudflare Tunnel |
|---|---|---|
| 비용 | 무료 | 터널 무료 + 도메인 연 약 $10 (Cloudflare Registrar, 원가) |
| 요청·용량 한도 | 월 2만 건, 1GB | 없음 |
| 주소 | `*.ngrok-free.app` | 내 도메인 (예: `hub.example.com`) |
| 첫 접속 경고 페이지 | 있음 | 없음 |

## 현재 설정

- 주소: **https://ebs-aihub.com** (`/user/`, `/admin/`, `/inventory.html`). 루트 주소는 `/user/`로 이동합니다.
- 터널: `ebs-ai-hub-portals` (Cloudflare 계정의 `ebs-inventory-api` 터널은 별개이므로 건드리지 않습니다)
- 재물조사 QR·설치 링크도 이 주소를 씁니다. `scripts/build-inventory-public.mjs`가 `.runtime/public-portals-url.txt`의 주소를 사용합니다.
- 도메인은 Cloudflare Registrar에서 1년 단위로 갱신합니다. **Auto Renew**를 켜 두세요.

## 최초 설정 (1회)

1. Cloudflare에 가입하고 Registrar에서 도메인을 구매합니다.
2. 이 PC에서 아래를 실행합니다. 브라우저가 열리면 Cloudflare에 로그인하고 도메인을 선택해 승인합니다.
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/setup-cloudflare-portals.ps1 -Hostname hub.example.com
   ```
   이 스크립트가 하는 일:
   - 터널 `ebs-ai-hub-portals`를 만듭니다.
   - `.cloudflared/portals.yml`과 `portals-hostname.txt`를 저장합니다. 이 폴더는 git에서 제외됩니다.
   - DNS 레코드를 연결합니다.
3. ngrok을 종료하면 감시 스크립트가 30초 안에 Cloudflare Tunnel로 다시 띄웁니다. 직접 실행하려면 `scripts/start-public-portals.ps1`을 실행합니다.
4. Supabase 대시보드 → Authentication → URL Configuration에서 다음을 바꿉니다.
   - **Redirect URLs**에 `https://hub.example.com/**`를 추가합니다.
   - **Site URL**을 `https://hub.example.com/user/`로 바꿉니다.

## 동작

- `scripts/start-public-portals.ps1`는 아래 순서로 터널을 고릅니다. 지금 쓰는 방식은 `.runtime/portals-tunnel.mode`에 기록됩니다.
  1. `named`: `.cloudflared/portals.yml`이 있으면 내 도메인의 Cloudflare Tunnel을 씁니다. 주소가 고정됩니다.
  2. `quick`(기본): 도메인 설정 전에는 Cloudflare Quick Tunnel(`*.trycloudflare.com`)을 씁니다. 계정이 필요 없고 요청 수 제한도 없지만, **재시작할 때마다 주소가 바뀝니다**.
  3. `ngrok`: 저장소 루트 `ngrok-token.env`에 `PORTAL_TUNNEL=ngrok`이 있을 때만 씁니다.
- 다른 종류의 터널이 이미 떠 있으면 종료한 뒤 교체합니다.
- 공개 주소는 `.runtime/public-portals-url.txt`에 저장됩니다.
- 터널 자격 증명은 `%USERPROFILE%\.cloudflared\{터널ID}.json`에 있습니다. 감시 스크립트도 같은 사용자 계정으로 실행됩니다.
- 업로드는 요청 1건당 최대 100MB입니다(Cloudflare 무료 플랜 제한).

고정 주소를 쓰지 않으려면 `.cloudflared/portals.yml`을 지우고 터널을 재시작합니다. 그러면 Quick Tunnel로 돌아갑니다.
