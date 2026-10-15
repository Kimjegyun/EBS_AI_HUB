# 외부 포털 고정 주소 (ngrok)

USER·ADMIN 포털(포트 3002, `scripts/serve-public-portals.mjs`)을 ngrok으로 외부에 공개합니다.

## 구성

- `scripts/start-public-portals.ps1`: 제출 백엔드(3003) → 포털 게이트웨이(3002) → ngrok 순서로 실행하고, 공개 주소를 `.runtime/public-portals-url.txt`에 저장합니다.
- `scripts/keep-public-portals-online.ps1`: 30초마다 위 스크립트를 다시 실행해 꺼진 부분을 복구합니다.
- `scripts/install-public-portals-auto-start.ps1`: Windows 로그인 시 감시 스크립트가 자동 실행되도록 시작프로그램에 등록합니다.

## 고정 주소 설정 (최초 1회)

1. ngrok 대시보드(https://dashboard.ngrok.com/domains)에서 무료 고정 도메인을 하나 받습니다.
2. 저장소 루트의 `ngrok-token.env`(git 제외 파일)에 한 줄을 추가합니다.
   ```
   NGROK_DOMAIN=받은도메인.ngrok-free.app
   ```
3. 실행 중인 ngrok 프로세스를 종료합니다. 감시 스크립트가 30초 안에 고정 도메인으로 다시 띄웁니다. 직접 실행하려면 다음 명령을 씁니다.
   ```
   powershell -ExecutionPolicy Bypass -File scripts/start-public-portals.ps1
   ```

4. Supabase 대시보드 → Authentication → URL Configuration의 **Redirect URLs**에 `https://<도메인>/**`를 추가합니다. 이 항목이 없으면 이메일 인증 링크와 Google 로그인이 Site URL(localhost)로 되돌아갑니다. 외부 접속이 기본이라면 **Site URL**도 `https://<도메인>/user/`로 바꿉니다.

`NGROK_DOMAIN`이 없으면 ngrok이 실행할 때마다 임의 주소를 받습니다.

## 접속 주소

- 사용자: `https://<도메인>/user/`
- 관리자: `https://<도메인>/admin/`
- 재물조사: `https://<도메인>/inventory.html`

ngrok 무료 플랜은 브라우저로 처음 접속할 때 경고 페이지를 한 번 보여 줍니다. **Visit Site**를 누르면 됩니다.
