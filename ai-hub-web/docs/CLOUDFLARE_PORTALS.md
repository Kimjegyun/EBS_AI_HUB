# 외부 포털 고정 주소 (Cloudflare Tunnel)

## ACAP 원격 보안 · 2026-10-17

ACAP 외부 화면은 제작 프로그램의 `dist-portal` 빌드만 제공합니다. `server/portalApplication.mjs`는 공개 화면 요청을 개발 서버에 전달하지 않으며 개발 WebSocket도 공개하지 않습니다. ACAP 화면을 수정한 뒤에는 해당 저장소에서 `npm run build:portal`을 실행해야 운영 화면에 반영됩니다. 이 빌드는 서버 키·토큰·비밀 파일이 공개 산출물에 포함되지 않았는지도 검사합니다.

원격 USER·ADMIN 모두 인증·API 설정은 잠금 화면만 표시됩니다. 서버 측에서도 설정 변경, 개인 Google 인증 토큰 발급, 저장소 재설정, 서버 로컬 파일 접근 및 소스 복구 요청을 제한합니다. 제작 API와 사용자별 Drive 저장·조회는 승인된 계정으로 계속 사용할 수 있습니다. 설정 관리는 서버 PC의 로컬 프로그램에서 수행합니다.

`.private`·`PRIVATE`·환경 파일·비밀 압축 파일과 대소문자/다중 인코딩 우회 경로를 차단합니다. 실제 운영 서버의 `.private` NTFS 접근 권한은 서버 실행 계정, SYSTEM, Administrators로 제한했으며 기존 ACL은 비밀 폴더 안에 복구용으로 보관했습니다. 서버 계정이나 Windows 관리자 권한으로 직접 파일을 복사하는 행위까지 웹 접근 제한으로 방지할 수는 없습니다.

회귀 검증은 ACAP의 `scripts/remote-security.test.mjs`, `scripts/remote-security-browser.mjs`와 기존 저장소 검증에 포함됩니다. 실제 계정이나 제작 API를 쓰지 않고 공개 빌드의 USER·ADMIN 잠금 및 저장 기능 유지를 확인합니다.

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

## 로그인 후 dashboard 공개 경로 오류 · 2026-10-17

이전 로그인 복귀 판별은 포털 내부의 /dashboard를 외부 앱으로 취급하여 /admin/ 또는 /user/ 접두사 없이 전체 페이지를 이동시켰다. 포털의 실제 라우트와 외부 제작 앱의 복귀 주소를 구분하여 내부 화면은 BrowserRouter의 basename을 유지한다. 이전 Google 복귀 저장본도 같은 판별로 읽고, 다른 제작 앱의 프로젝트·쿼리·단계 복귀는 보존한다.

기존 /dashboard 등 등록된 포털 페이지 주소의 GET·HEAD 요청은 포털 경로로 연결한다. 같은 호스트의 /admin/ 또는 /user/ Referer가 있으면 해당 포털을 사용하며, 직접 접속은 /user/로 연결한다. 이 정보는 화면 선택용이며 로그인·멤버십·관리자 권한 검증을 생략하지 않는다. API와 알 수 없는 경로는 공개하지 않는다.

회귀 검증: bun run verify:production-feedback (test:portals). 서로 다른 외부 앱, 포털 내부 경로, 구형 Google 복귀 저장본, 재조회, GET·HEAD/POST, 잘못된 외부 Referer, 비공개 경로 차단을 확인한다. 이 수정은 포털 빌드 및 게이트웨이 재시작 후 적용되며 ACAP 자산 재생성이나 Premiere 재내보내기는 필요하지 않다.

검증 결과: 회귀 테스트 7개, 실제 Chrome의 관리자·사용자 로그인 복귀 및 새로고침 4개 사례, 타입 검사와 변경 코드 ESLint, 두 공개 포털 빌드가 통과했다. 브라우저 회귀는 별도 임시 프로필의 합성 세션을 사용하고 제작 API 요청을 막는다. 이 명령은 공개 포털 빌드와 게이트웨이 실행 후 사용하며, 다른 검증 서버는 PORTAL_TEST_ORIGIN으로 지정한다. 실제 사용자 Google 로그인 완료는 사용자가 재시도하여 확인해야 한다.
