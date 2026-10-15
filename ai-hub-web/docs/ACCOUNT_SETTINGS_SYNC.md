# 계정 환경 동기화 (PC·휴대폰)

같은 계정으로 로그인하면 PC, 다른 브라우저, 휴대폰, 홈 화면 앱 어디서든 같은 환경이 보입니다.

## 동기화되는 것

사용자별 저장 항목(`setUserScopedItem`으로 저장하는 값)은 모두 동기화됩니다.

| 항목 | 저장 키 |
|---|---|
| 설치한 앱, 대시보드에 켠 앱 | `dashboard-installed-apps`, `dashboard-active-widgets` |
| 대시보드 배치·크기·최대화 | `dashboard-layouts`, `dashboard-grid-width/height`, `dashboard-maximized-widget` |
| 메모 위젯, 할 일, 개인 일정 | `widget-notes`, `ai-hub-tasks-v1`, `ai-hub-personal-events-v1` |
| 개인 설정 | `user_preferences` |
| 재물조사 선택 정보 | `inventory-survey-preferences`, `inventory-last-install-dept` |
| 이메일 작성기 초안 | `email-writer-draft` |

새로 추가하는 기능도 `setUserScopedItem`으로 저장하면 자동으로 동기화됩니다.

**동기화하지 않는 것:**
- 달력 캐시(`enhanced-calendar-events…`)
- My LLM 대화 상태
- 마지막 페이지
- 진행 중 조사 ID(`inventory-active:`)
- API 키 등 포털 공용 값(`setPortalScopedItem`)
- 256KB가 넘는 값

## 동작

1. 로그인하면 화면을 그리기 전에 계정 설정을 먼저 받아옵니다. 최대 4초까지만 기다리고, 그 사이 받지 못하면 이 기기의 값으로 시작합니다.
2. 설정을 바꾸면 1초 뒤 서버에 저장합니다. 연속으로 바꾸면 마지막 값만 저장합니다.
3. 앱으로 돌아올 때(포커스, 화면 켜짐)마다 다시 맞춥니다.
4. 항목마다 마지막으로 바꾼 시각을 기록하고, 더 최근 쪽이 이깁니다. 삭제도 동기화됩니다.
5. 오프라인에서 바꾼 값은 다음 동기화 때 올라갑니다.
6. 계정에 아직 없는 값(이 기기에서 처음 쓰는 경우)은 올라갑니다.

사용자 포털과 관리자 포털의 설정은 따로 저장됩니다.

## 구성

- **클라이언트:** `src/lib/settingsSync.ts`(동기화), `src/components/RequireAuth.tsx`(로그인 후 첫 동기화·포커스 동기화), `src/lib/userScopedStorage.ts`(변경 감지)
- **서버:** `server/src/routes/userSettings.routes.ts`
  - 경로는 `GET/PUT /api/users/me/settings/:portal`이고, `user_settings` 테이블에 저장합니다.
  - 3001(PC)과 3003(휴대폰, ngrok)이 같은 DB를 쓰므로 어디서 저장해도 같은 값이 보입니다.
- **본인 확인:** 앱이 Supabase 로그인 토큰을 Bearer로 보내면, 서버가 Supabase(`/auth/v1/user`)에 확인해서 계정 ID를 얻습니다. 확인 결과는 5분간 캐시합니다.
  - 이를 위해 `server/.env`에 `SUPABASE_URL`, `SUPABASE_ANON_KEY`(공개 anon 키)가 있어야 합니다.
- Supabase가 아닌 로컬 계정으로 로그인하면 동기화하지 않습니다. 기존처럼 기기에만 저장됩니다.
- 서버에 연결되지 않으면 동기화 없이 평소대로 동작합니다.

## 검증

- **서버:** 가짜 Supabase와 임시 DB로 확인했습니다.
  - 토큰이 없거나 틀리면 401을 돌려줍니다.
  - 다른 계정의 설정은 보이지 않습니다.
  - 오래된 값이 최신 값을 덮어쓰지 않습니다.
  - 삭제가 동기화됩니다.
- **클라이언트:** Chrome에서 같은 계정의 PC → 빈 휴대폰 → PC 순서로 시험했습니다.
  - 휴대폰이 설치 앱, 배치, 메모를 그대로 받았습니다.
  - 달력 캐시는 넘어가지 않았습니다.
  - 휴대폰에서 지운 메모가 PC에서도 지워졌습니다.
