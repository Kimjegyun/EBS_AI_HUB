# EBS 재물조사 Cloud API

Vercel에 배포한 PWA가 외부 네트워크에서 사용하는 저장/동기화 서버입니다.

- D1: 데이터셋, 조사 회차, 조사 결과, 사용자 간 중복 충돌
- R2: 운영관리부 원본, ERP 원본, 자산 사진, 결과 Excel
- 브라우저 IndexedDB: 오프라인 조사 결과와 사진의 임시 보관

## 준비 사항

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)에서 무료 계정을 만듭니다.
2. 왼쪽 메뉴 `Storage & databases > R2 > Overview`를 열고 R2 구독 활성화를 완료합니다.
   무료 사용량이 포함되지만 계정에 따라 결제수단 등록 화면이 먼저 나올 수 있습니다.
3. PC에 Node.js 20 이상이 설치되어 있어야 합니다. PowerShell에서 `node --version`으로 확인합니다.
4. Vercel에 배포된 AI HUB의 최종 주소를 준비합니다. 예: `https://ebs-ai-hub.vercel.app`

R2 버킷은 공개로 만들지 않습니다. 파일은 반드시 인증된 Worker API를 통해서만 내려받습니다.

## 권장: 자동 설정

PowerShell을 열고 다음을 실행합니다.

```powershell
cd D:\!!__AI_HUB\ai-hub-web\cloudflare
powershell -ExecutionPolicy Bypass -File scripts\setup-cloudflare.ps1 `
  -VercelOrigin "https://실제프로젝트.vercel.app"
```

스크립트가 다음 작업을 순서대로 처리합니다.

1. npm 의존성 확인 및 설치
2. Cloudflare 브라우저 OAuth 로그인
3. 서울에서 가까운 APAC 위치에 D1 `ebs-inventory` 생성
4. `wrangler.toml`에 실제 D1 ID 자동 반영
5. 비공개 R2 버킷 `ebs-inventory-files` 생성
6. 무작위 API 접근 토큰 생성 및 Worker Secret 등록
7. D1 테이블과 인덱스 생성
8. Worker 배포
9. Vercel에 넣을 네 가지 값을 출력하고 로컬 `.env.local` 생성

브라우저가 자동으로 열리지 않으면 터미널에 표시된 Cloudflare 로그인 URL을 복사해 직접
Chrome에서 여십시오. Microsoft 로그인이나 기기 코드는 필요하지 않습니다.

이미 D1을 만들어 둔 경우에는 ID를 전달해 중복 생성을 막을 수 있습니다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-cloudflare.ps1 `
  -VercelOrigin "https://실제프로젝트.vercel.app" `
  -DatabaseId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

## 수동 설정

자동 설정이 실패할 때만 아래 절차를 사용합니다.

```powershell
cd ai-hub-web/cloudflare
npm install
npx wrangler login
npx wrangler d1 create ebs-inventory --location apac
npx wrangler r2 bucket create ebs-inventory-files
```

`d1 create`가 출력한 `database_id`를 `wrangler.toml`의
`REPLACE_WITH_D1_DATABASE_ID`에 넣습니다. 그 다음:

```powershell
npx wrangler secret put API_TOKEN
npm run db:migrate
npm run deploy
```

정상 배포 마지막에는 다음 형태의 주소가 출력됩니다.

```text
https://ebs-inventory-api.<계정서브도메인>.workers.dev
```

브라우저에서 `<Worker 주소>/health`를 열었을 때 `{"ok":true,...}`가 나오면 Worker가
정상 실행 중입니다.

`ALLOWED_ORIGINS`는 실제 Vercel 주소로 바꿉니다. 예:

```toml
ALLOWED_ORIGINS = "https://ebs-ai-hub.vercel.app"
```

## Vercel 연결

1. [Vercel Dashboard](https://vercel.com/dashboard)에서 AI HUB 프로젝트를 선택합니다.
2. `Settings > Environment Variables`로 이동합니다.
3. 아래 네 개를 `Production`, `Preview`, `Development`에 등록합니다.

```text
VITE_PUBLIC_URL=https://<vercel-project>.vercel.app
VITE_INVENTORY_APP_URL=https://<vercel-project>.vercel.app/inventory.html
VITE_INVENTORY_API_URL=https://ebs-inventory-api.<cloudflare-account>.workers.dev
VITE_INVENTORY_TOKEN=<Worker API_TOKEN과 같은 값>
```

4. `Deployments`에서 가장 최근 배포의 메뉴를 열고 `Redeploy`를 실행합니다. Vite의
   `VITE_` 변수는 빌드 시 브라우저 코드에 반영되므로 환경변수만 저장하고 재배포하지 않으면
   이전 주소를 계속 사용합니다.
5. 배포 완료 후 `https://<Vercel주소>/inventory.html`을 휴대폰에서 엽니다.

`VITE_INVENTORY_TOKEN`은 자동 설정 스크립트가 마지막에 한 번 출력한 값을 그대로 사용합니다.
값 앞뒤에 따옴표나 공백을 넣지 않습니다.

## 배포 후 자동 점검

```powershell
cd D:\!!__AI_HUB\ai-hub-web\cloudflare
powershell -ExecutionPolicy Bypass -File scripts\verify-cloud.ps1 `
  -WorkerUrl "https://ebs-inventory-api.<계정>.workers.dev" `
  -AccessToken "설정할 때 출력된 토큰"
```

점검 스크립트는 Health, D1 조회, R2 파일 메타데이터 조회, 무인증 요청 차단을 확인합니다.

## 실제 업무 점검 순서

1. PC Admin 설정에서 운영관리부 전사 Excel을 등록합니다.
2. 본부 한 곳의 ERP Excel을 등록하고 데이터셋 건수가 표시되는지 확인합니다.
3. Admin의 QR을 휴대폰 LTE/5G로 촬영합니다. 같은 Wi-Fi일 필요가 없습니다.
4. 홈 화면에 앱을 설치하고 이름·소속·부서를 저장합니다.
5. ERP 파일이 자동 다운로드된 상태에서 자산 한 건을 QR로 조사하고 사진을 촬영합니다.
6. 비행기 모드에서 한 건을 추가 조사한 뒤 네트워크를 켜서 자동 동기화를 확인합니다.
7. `최종 등록`을 눌러 Admin 산출물 목록에 ERP 결과와 운영관리부 최종 파일이 생성되는지 확인합니다.
8. 두 휴대폰에서 같은 자산을 서로 다른 사용자 이름으로 제출하여 충돌 결과가 원본을
   덮어쓰지 않는지 확인합니다.

## 자주 발생하는 오류

- `401`: Vercel의 `VITE_INVENTORY_TOKEN`과 Worker의 `API_TOKEN`이 다릅니다. Secret을 다시
  등록하고 Vercel도 재배포합니다.
- `CORS`: `wrangler.toml`의 `ALLOWED_ORIGINS`가 실제 Vercel 주소와 정확히 같아야 합니다.
  끝의 `/`는 제외합니다.
- `D1_ERROR no such table`: `npm run db:migrate`를 실행하지 않았습니다.
- `R2 bucket not found`: R2 구독 활성화와 버킷 이름을 확인합니다.
- `REPLACE_WITH_D1_DATABASE_ID`: D1 생성 후 실제 UUID로 교체하지 않은 상태입니다.
- 환경변수를 바꿨는데 localhost 접속: Vercel을 다시 배포하지 않았거나 브라우저/PWA가 이전
  번들을 캐시했습니다. PWA를 종료 후 다시 열고 필요하면 앱을 제거한 뒤 재설치합니다.
- 50MB 업로드 실패: Vercel Function 주소가 아니라 `workers.dev` API로 요청되는지 브라우저
  개발자도구 Network에서 확인합니다.

현재 토큰 방식은 기관 내부용 1차 배포 방식입니다. 인터넷에 완전히 공개하는 운영 배포에서는
Cloudflare Access 또는 사용자별 짧은 수명의 조사 토큰으로 교체해야 합니다. R2 키나 D1 자격
정보는 브라우저에 넣지 않습니다.

## 업무 흐름

1. Admin이 운영관리부 전사 Excel을 등록하면 원본을 R2에 보관하고 시트 목록을 읽습니다.
2. Admin이 본부별 ERP Excel을 등록하면 선택 시트와 자산번호로 병합하여 D1 데이터셋을 만듭니다.
3. 사용자는 QR의 Vercel PWA를 열고 앱을 설치한 뒤 이름·소속·부서를 기기에 저장합니다.
4. ERP/자산 데이터셋은 IndexedDB에 내려받으므로 통신이 끊겨도 조사할 수 있습니다.
5. 자산 스티커 QR과 현물 사진을 기기에 저장하고 연결 복구 시 결과를 Worker에 전송합니다.
6. 최종 제출 시 사진은 R2에, 결과는 D1에 저장됩니다.
7. 동일 데이터셋/자산번호를 다른 사용자가 먼저 등록했으면 최초 결과를 유지하고 후속 결과는
   `result_conflicts`에 분리합니다. `GET /api/inventory/conflicts`로 관리자가 확인할 수 있습니다.
8. 기존 앱의 ERP 검수 반영 파일과 운영관리부 대조 파일 생성 기능이 결과 Excel을 만든 뒤 R2에
   보관합니다.

## 검증

```powershell
npx tsc --noEmit
npx wrangler deploy --dry-run
```
