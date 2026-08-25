# EBS-AI HUB 개발 가이드라인

> 사내 AI 앱을 한 곳에서 설치·배포·관리하는 **포털형 플러그인 허브**.
> 사용자는 필요한 앱을 골라 설치하고, 개발자/관리자는 자유롭게 앱을 배포하며,
> 마켓플레이스에서 앱을 자유롭게 추가·삭제할 수 있습니다.

---

## 1. 제품 비전

EBS-AI HUB는 단일 애플리케이션이 아니라 **여러 AI 앱(플러그인)을 담는 포털(셸, Shell)** 입니다.

- **포털(Shell)**: 인증, 내비게이션, 대시보드, 마켓플레이스, 권한, 공통 UI를 제공하는 본체.
- **플러그인(App)**: 포털 위에 설치되어 동작하는 독립 기능 단위(예: 회의록 요약, 번역, 챗봇 등).
- **마켓플레이스(Marketplace)**: 등록된 앱을 탐색·설치·제거하고, 개발자가 앱을 배포(등록)하는 공간.

핵심 사용자 흐름 3가지:

1. **설치(Install)** — 사용자가 등록된 앱을 자신의 워크스페이스에 추가.
2. **배포(Publish)** — 개발자/관리자가 새 앱을 허브에 등록·버전 업데이트.
3. **관리(Manage)** — 마켓 형태로 앱을 자유롭게 추가/삭제, 권한·노출 제어.

---

## 2. 아키텍처 개요

```
┌─────────────────────────────────────────────────────────┐
│                     Portal Shell (이 저장소)              │
│  Auth · Layout · Dashboard · Marketplace · Permissions    │
│                                                           │
│   ┌──────────────┐   App Registry (앱 메타/매니페스트)   │
│   │ Plugin Host  │◄──────────────────────────────────────│
│   │ (실행 컨테이너)│   Installed Apps (사용자별 설치 상태) │
│   └──────┬───────┘                                        │
│          │ 로드/샌드박스                                   │
│   ┌──────▼───────┐  ┌──────────────┐  ┌──────────────┐   │
│   │  App A        │  │   App B      │  │   App C ...  │   │
│   └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 2.1 플러그인 실행 모델 (선택지와 권장)

| 방식 | 격리성 | 배포 자유도 | 구현 난이도 | 권장 단계 |
|------|--------|-------------|-------------|-----------|
| **A. 내부 모듈 등록** (코드 내 import) | 낮음 | 낮음(재빌드 필요) | 낮음 | MVP/1차 |
| **B. iframe + postMessage** | 높음(샌드박스) | 높음(URL만 등록) | 중간 | **권장(2차)** |
| **C. Module Federation / 동적 import(원격)** | 중간 | 높음 | 높음 | 고도화(3차) |

**권장 로드맵**: 1차는 A로 빠르게 구조를 잡고, "자유로운 추가/삭제·외부 배포"라는 목표에는 **B(iframe 샌드박스)** 가 가장 현실적입니다. 외부 팀이 만든 앱을 URL만으로 등록/제거할 수 있고, 보안 격리가 자연스럽습니다. 공통 디자인 시스템 공유가 중요해지면 C를 도입합니다.

### 2.2 포털 ↔ 플러그인 통신 규약 (iframe 기준)

`postMessage` 기반 메시지 버스로 표준화합니다.

- `hub:init` — 포털→앱: 세션/테마/권한/언어 전달
- `hub:resize` — 앱→포털: 높이 변경 요청
- `hub:navigate` — 앱→포털: 라우팅 이동 요청
- `hub:storage:get|set` — 앱↔포털: 허브가 중개하는 영속 저장
- `hub:event` — 양방향: 커스텀 이벤트(분석/알림 등)

모든 메시지는 `{ type, payload, requestId }` 형식과 `targetOrigin` 화이트리스트를 강제합니다.

---

## 3. 앱 매니페스트 스펙 (App Manifest)

모든 앱은 다음 메타데이터로 등록됩니다(레지스트리에 저장).

```jsonc
{
  "id": "meeting-summary",            // 고유 slug
  "name": "회의록 요약",
  "version": "1.2.0",                 // SemVer
  "description": "회의 음성을 요약합니다",
  "category": "생산성",              // 코어 | 생산성 | 운영 | 기타
  "icon": "summarize",               // Material Symbols 이름
  "entry": {
    "type": "iframe",                // module | iframe | remote
    "url": "https://apps.ebs.example/meeting-summary"
  },
  "permissions": ["storage", "notifications", "user:profile"],
  "scopes": ["user", "admin"],       // 노출 대상 역할
  "publisher": "EBS AI팀",
  "status": "published"              // draft | published | deprecated
}
```

매니페스트는 **버전 불변(immutable per version)** 으로 다루고, 업데이트 시 새 버전을 추가합니다.

---

## 4. 데이터 모델 (Supabase 기준)

| 테이블 | 용도 | 핵심 컬럼 |
|--------|------|-----------|
| `apps` | 앱 레지스트리(매니페스트) | id, name, version, category, entry, permissions, scopes, status |
| `app_installs` | 사용자별 설치 상태 | user_id, app_id, installed_at, settings(jsonb), enabled |
| `app_versions` | 버전 이력 | app_id, version, changelog, released_at |
| `app_permissions` | 권한 정의/승인 | app_id, permission, granted_by |

> 이미 존재하는 패턴(예: `company_holidays`, `personal_events`)과 동일하게
> **RLS(행 수준 보안)** 를 적용합니다: 사용자는 본인 `app_installs`만, 관리자는 `apps` 쓰기 권한.

---

## 5. 저장/동기화 전략 (현재 코드 컨벤션)

이 프로젝트는 **"Supabase 우선 → 실패 시 localStorage 폴백"** 패턴을 표준으로 합니다.
(예: `holidayService`, `eventService`, `userPreferenceService`)

규칙:

1. 서비스 계층(`src/lib/*Service.ts`)에서만 데이터 접근. 컴포넌트는 서비스만 호출.
2. Supabase 미설정/오류 시 **throw 대신 폴백** 후 `console.warn`으로 기록.
3. "전 사용자 공통" 데이터는 **코드 기본값(default)** + DB 병합으로 제공(예: 기본 공휴일).
4. 로컬 폴백은 브라우저 단위임을 인지 — **다중 사용자 승계가 필요한 데이터는 반드시 Supabase 마이그레이션 적용**.

마이그레이션은 `supabase/migrations/`에 타임스탬프 파일로 추가하고, 실제 프로젝트에 적용해야 동작합니다(현재 일부 테이블 미적용 상태).

---

## 6. 폴더 구조 컨벤션

```
src/
  auth/          인증/세션/멤버십
  components/     공통 UI 컴포넌트 (재사용)
  context/        전역 Context Provider
  lib/            서비스 계층(데이터 접근, 도메인 로직)
  pages/          라우트 단위 페이지
  types/          공유 타입 정의
  (제안) plugins/  플러그인 호스트/레지스트리/매니페스트 로더
```

신규 플러그인 시스템은 `src/plugins/`에 모읍니다:
`PluginHost.tsx`(실행 컨테이너), `appRegistry.ts`(레지스트리 서비스), `manifest.ts`(스펙/검증), `messageBus.ts`(postMessage 규약).

---

## 7. 코딩 컨벤션

- **언어/스택**: TypeScript(strict) + React 19 + Vite + Tailwind. 클래스형 대신 함수형 컴포넌트/훅.
- **타입**: `any` 지양, 공유 타입은 `src/types`에 정의. 서비스 반환 타입 명시.
- **상태**: 서버 데이터는 서비스 계층 경유. 컴포넌트 로컬 상태는 `useState`/`useReducer`.
- **에러 처리**: 사용자 흐름을 막지 않도록 폴백 우선, 로깅은 `console.warn/error`.
- **주석**: "무엇"이 아니라 "왜"만. 디버그용 `console.log`는 커밋 금지.
- **미사용 코드**: `noUnusedLocals` 통과 필수. 데드 파일은 즉시 제거.
- **빌드 게이트**: 머지 전 `npm run build`(= `tsc -b && vite build`) 통과 필수.
- **접근성**: 버튼/입력에 `aria-label`, 키보드 포커스 고려.
- **국제화**: 사용자 노출 문구는 한국어 기본, 하드코딩 브랜드명은 "EBS-AI HUB"로 통일.

---

## 8. 보안 / 권한

- **역할**: `user`(설치/사용) / `admin`(배포·앱 관리·사용자 승인). 라우트는 `RequireAuth`/`RequireAdmin`로 보호.
- **플러그인 격리**: 외부 앱은 iframe `sandbox` 속성 + `allow` 최소 권한 + `targetOrigin` 화이트리스트.
- **권한 모델**: 앱이 요청한 `permissions`를 설치 시 사용자에게 고지/동의. 허브가 중개하는 API만 노출.
- **시크릿**: 키는 `.env`(클라이언트는 anon key만). 서버 시크릿은 절대 번들에 포함 금지.

---

## 9. 단계별 로드맵

**1차(MVP) — 정적→동적 마켓**
- `apps`/`app_installs` 테이블 + 서비스 계층(폴백 포함) 구축.
- MarketplacePage를 목업 → 레지스트리 연동(설치/제거 버튼 실제 동작).
- 대시보드에 "설치한 앱" 위젯 노출.

**2차 — 플러그인 호스트(iframe)**
- `src/plugins/` 도입, 매니페스트 로더 + postMessage 버스.
- 앱 상세/실행 화면, 권한 동의 플로우.

**3차 — 셀프 배포 & 거버넌스**
- 관리자 배포 콘솔(매니페스트 등록/버전/상태 관리), 승인 워크플로.
- 사용량/감사 로그, 버전 롤백, 비활성화(deprecate).

**4차 — 고도화**
- Module Federation 기반 공통 디자인 시스템 공유, 검색/추천, 평점.

---

## 10. 현재 정리 내역 & 후속 권장

**이번 정리(완료)**
- 브랜드 명칭 **EBS-AI HUB**로 통일(로고/타이틀/페이지 문구).
- 데드코드 제거: `unifiedEventService.ts`, `HolidayCalendar.tsx`, `HolidaysPage.tsx`.
- 디버그 잔여물 제거: `vite-dev.log`, `vite-dev.err.log`, `test-biweekly.html`.

**후속 권장(선택)**
- `localServerApi.ts`/`server/`: 현재 앱에서 미사용. 로컬 서버 연동 계획이 없다면 제거 검토.
- `eventService`의 미사용 알림 메서드(`getNotificationPreferences`, `getPendingNotifications`, `markNotificationAsSent` 등): 알림 기능 본격화 전까지 정리 가능.
- 루트의 다수 `*.md`/`*.ps1` 문서·스크립트: 최신화 또는 `docs/`로 통합.
- 번들 경고(>500KB): 라우트 단위 `React.lazy` 코드 분할 도입.
- Supabase 마이그레이션 적용(다중 사용자 승계가 필요한 휴일/일정/앱 데이터).

---

_본 문서는 EBS-AI HUB의 아키텍처 기준선입니다. 변경 시 PR에 사유를 남기고 이 문서를 함께 갱신하세요._
