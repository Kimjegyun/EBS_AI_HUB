# EBS AI HUB

어느 조직에서나 도입할 수 있는 **오픈소스 AI 업무 플랫폼**.
공동 마켓플레이스에 등록된 무료 오픈소스 앱을 골라 설치하고, 필요하면 고쳐 쓰고, 고친 것을 다시 나누는 **공동의 플랫폼**입니다.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

---

## 왜 오픈소스인가

이 프로젝트는 한 조직의 내부 도구로 출발했지만, **그 안에 가둬 두지 않기 위해** 공개합니다.

조직이라면 규모나 업종을 가리지 않고 같은 업무가 반복됩니다. 자산과 비품을 관리하고,
일정을 나누고, 문서를 정리하고, 이제는 AI를 업무에 붙입니다. 그런데 그 도구는 회사마다
새로 만들거나, 비싼 솔루션을 사거나, 결국 엑셀로 버팁니다.

그 공통분모를 **어느 조직에서나 도입해 생산성을 높일 수 있는 AI 업무 허브**로 만들고,
소프트웨어 자체를 **공공재처럼 열어 두어 함께 키우자**는 것이 이 프로젝트의 방향입니다.

- **가져다 쓰고** — 서버 한 대와 브라우저면 됩니다. 별도 DBMS도, 라이선스 비용도 없습니다.
- **필요한 만큼 고치고** — 앱은 파일 하나 + 레지스트리 한 줄. 자기 회사에 맞는 앱을 붙이면 됩니다.
- **다시 나눕니다** — 고친 것을 되돌려 주면 다음 사용자의 비용이 내려갑니다.

**쓰는 사람이 곧 만드는 사람이 되는 구조**입니다. 사용자가 늘수록 소프트웨어가 좋아집니다.
교육 공영방송이라는 자리에서 만든 도구를 모두가 쓸 수 있게 여는 것 자체가 또 하나의 공적 가치라고 봅니다.
기여 방법은 [CONTRIBUTING.md](./CONTRIBUTING.md) 를 봐주세요.

---

## 무엇을 푸는가

정기 재물조사는 운영관리부가 배부한 전사 양식과 부서별 ERP 자산현황을 사람이 눈으로 대조하는 일이었습니다. 세 가지가 반복해서 발목을 잡았습니다.

| 문제 | 해결 |
|---|---|
| 자산 라벨 QR은 `QQ000120240000`, ERP 대장은 `QQ00012-0240-000` — 표기가 달라 스캔해도 조회 안 됨 | **하이픈 무시 보조 색인**. 정확 일치 → 하이픈 무시 순으로 2단계 조회 |
| 스튜디오·기계실 등 통신이 끊기는 현장 | **오프라인 우선 PWA**. IndexedDB + 동기화 큐, 복구 시 자동 전송 |
| "몇 건 했나"만 알 수 있고 "다 했나"는 알 수 없음 | **커버리지 통계**. 데이터셋 전체 자산을 분모로 본부 → 부서 → 확인자 집계 |

## 플랫폼이 하는 일

| | |
|---|---|
| **앱 마켓플레이스** | 등록된 앱을 둘러보고 필요한 것만 설치합니다. 설치 상태는 사용자별로 따로 관리됩니다. |
| **앱 등록** | 관리자가 앱을 마켓플레이스에 게시하고 내립니다. 조직마다 노출할 앱을 고를 수 있습니다. |
| **대시보드** | 설치한 앱을 위젯으로 배치합니다. 드래그·리사이즈로 자기 화면을 구성합니다. |
| **앱 플러그인 계약** | 앱은 **파일 하나 + 레지스트리 한 줄**. 셸 코드를 건드리지 않고 추가됩니다. |
| **원격 앱 배포** | 앱 번들을 마켓플레이스에 올리면 **허브를 다시 빌드하지 않고** 실행 중에 등록됩니다. |
| **앱 제출·심사** | 누구나 만든 앱을 제출하고, 관리자가 코드를 읽고 승인해야 배포됩니다. 승인은 **버전 단위**입니다. |
| **앱 이식 (내보내기·가져오기)** | 만든 앱을 파일 하나로 내보내 **다른 회사 허브에 그대로 붙일 수 있습니다.** |
| **AI 계층** | 앱이 공유하는 AI 프록시. 사용자가 모델을 고르고, **사내 보안 데이터를 다루는 앱은 자체 서버의 오픈웨이트 모델**로 바꿔 끼웁니다. |
| **사용자·권한** | 로그인, 승인, 관리자 전용 화면 분리 |

현재 앱 10종이 함께 배포됩니다 — 캘린더 · 나의 LLM · 메일 생성기 · Codex · **재물조사** ·
빠른 작업 · 할 일 · 메시지 · 메모 · 바로가기.

### 공동 마켓플레이스는 어떻게 커지나

앱을 넣는 길이 **두 가지**입니다.

| | 내장 앱 | 제출 앱 |
|---|---|---|
| 누가 | 저장소 기여자 | **누구나** |
| 방법 | 저장소에 파일 추가 + 레지스트리 한 줄 → PR | 마켓플레이스에서 **제출 → 관리자 승인** |
| 허브 재빌드 | 필요 | **불필요** |
| 배포 범위 | 이 저장소를 쓰는 모두 | 그 서버를 쓰는 조직 |

널리 쓰일 앱은 PR로 등록해 모두가 받아 쓰고, 조직 전용 앱이나 빠른 실험은
**제출하고 승인받는 것만으로 바로 얹습니다.**

```
개발 → 로컬 미리보기 → 제출 → 관리자 심사(코드 열람) → 승인 → 배포
                                                    └ 문제 시 즉시 정지
```

원격 앱 코드는 허브와 같은 권한으로 실행되고 샌드박스가 없습니다.
그래서 **관리자가 코드를 직접 읽고 승인해야** 다른 사용자에게 나갑니다.
승인은 앱이 아니라 버전 단위라, 승인받은 앱을 나중에 다른 코드로 바꿔치기할 수 없습니다.

만든 앱은 **파일 하나로 내보내 다른 회사 허브에 그대로 붙일 수 있습니다.**
받는 쪽은 `가져오기` 한 번이면 되고, 메타데이터를 입력하거나 빌드할 필요가 없습니다.
각자 만든 앱이 조직 경계를 넘어 쌓이게 하려는 장치입니다.

만드는 방법은 [doc/REMOTE_APPS.md](doc/REMOTE_APPS.md) 에 있습니다.
JSX·TypeScript 로 쓰고 싶다면 [examples/app-template/](examples/app-template/) 를 복사해 시작하세요 —
빌드하면 허브가 읽는 단일 ESM 파일이 나옵니다.
빌드 없이 파일 하나로 만드는 최소 예제는 [examples/remote-apps/hello-world.app.js](examples/remote-apps/hello-world.app.js) 입니다.

```js
// 앱 하나가 이만큼입니다 — 빌드도, 재배포도 없이 마켓플레이스에 올라갑니다
export default ({ React }) => ({
  id: 'hello-world', name: '인사', icon: 'waving_hand',
  description: '최소 예제', category: '생산성',
  defaultSize: { w: 3, h: 3, minW: 2, minH: 2 },
  Body: () => React.createElement('div', null, '안녕하세요'),
})
```

---

## 사례로 만든 앱 — 재물조사

플랫폼이 실제 업무를 감당하는지 검증하려고 만든 앱입니다. 방송장비 **9,291건**의
실데이터로 돌아갑니다. 다른 앱을 만들 때 참고할 만한 가장 복잡한 예제이기도 합니다.

- **QR 스캔 자산 실사** — 스캔 즉시 자산 조회, 연속 스캔 모드, 현물 사진 첨부
- **엑셀 왕복(round-trip)** — 담당자가 쓰던 ERP 파일의 열·서식을 보존한 채 맨 앞에 검수 4열(검수완료·검수인부서·검수인·검수날짜)만 추가
- **설치부서 대조 파일** — 운영관리부 양식의 설치부서를 ERP와 대조해 동일은 노랑, 변경은 주황으로 셀을 칠하고 원래 값을 셀 메모로 기록
- **커버리지 통계** — 본부 → 설치부서 → 확인자 3계층, 미확인 자산 상세 목록
- **플러그인 앱 허브** — 앱 하나를 파일 하나로 만들고 레지스트리에 한 줄 등록하면 대시보드·마켓플레이스에 자동 반영 (현재 10종)

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프론트엔드 | React 19, TypeScript 6, Vite 8, Tailwind CSS 3, React Router 7 |
| 현장 앱 | PWA (Service Worker, IndexedDB), html5-qrcode |
| 엑셀 | SheetJS(xlsx) 파싱·생성, exceljs (셀 배경색·메모) |
| 백엔드 | Node.js, Express 4, SQLite, helmet, JWT, multer |
| 개발 | ESLint 10, typescript-eslint, tsx, vite-plugin-mkcert |

카메라와 PWA 설치는 보안 컨텍스트를 요구하므로 개발 서버도 **HTTPS**로 구동합니다.

## 폴더 구조

```
.
├── ai-hub-web/          프론트엔드 + 백엔드
│   ├── src/             React 앱 (apps/ 아래에 앱 플러그인)
│   ├── server/          Express + SQLite API 서버
│   ├── public/          정적 자원, PWA 매니페스트, Service Worker
│   ├── index.html       허브 셸 진입점
│   └── inventory.html   재물조사 PWA 단독 진입점
├── doc/                 문서
│   ├── apps/            앱별 실행 순서·메뉴얼 (앱마다 1개)
│   ├── design/          디자인 시스템 정의
│   └── legacy/          과거 설계 메모
├── specs/               기능 명세
├── scripts/             개발 서버·터널 실행 스크립트 (Windows)
└── tools/               보조 도구
```

## 실행 방법

### 요구 사항
- Node.js 20 이상
- Windows / macOS / Linux (실행 스크립트는 Windows 기준)

### 설치
```bash
npm install --prefix ai-hub-web
npm install --prefix ai-hub-web/server
```

### 환경 변수
각 `.env.example`을 복사해 값을 채웁니다.
```bash
cp ai-hub-web/.env.example        ai-hub-web/.env.local
cp ai-hub-web/server/.env.example ai-hub-web/server/.env
```
서버의 `JWT_SECRET`과 `ADMIN_ACCESS_CODE`는 반드시 채워야 기동됩니다.

### 개발 서버
```bash
# 백엔드 (포트 3001)
npm run dev --prefix ai-hub-web/server

# 프론트엔드 — 사용자 화면 (포트 5173, HTTPS)
npm run dev:user --prefix ai-hub-web

# 프론트엔드 — 관리자 화면 (포트 5174, HTTPS)
npm run dev:admin --prefix ai-hub-web
```

Windows에서는 `scripts/restart-dev.ps1` 하나로 서버와 프론트엔드를 모두 띄울 수 있습니다.

### 프로덕션 빌드
```bash
npm run build --prefix ai-hub-web
```

## 사용 흐름 (재물조사)

1. **관리자** — 설정 탭에서 운영관리부 전사 양식(.xlsx) 업로드 → 본부 목록 확보
2. **관리자** — 본부별 ERP 자산현황(.xlsx) 업로드 → 서버가 자산번호로 병합해 데이터셋 생성
3. **현장** — 설치 QR을 폰으로 스캔 → 홈 화면에 추가 → 이름 입력, 본부 선택
4. **현장** — 자산 QR 스캔 → 자산 정보 자동 표시 → 검수 저장 (오프라인 가능)
5. **산출물** — 검수 4열 반영 ERP 파일, 설치부서 대조 파일 생성 (서버 보관 + 기기 저장)
6. **집계** — 통계 탭에서 본부·부서·확인자별 진행률과 미확인 자산 확인

자세한 내용은 [doc/apps/inventory.md](doc/apps/inventory.md)를 참고하세요.

> 재물조사는 **플랫폼 위에 얹힌 앱 하나**입니다. 같은 방식으로 자기 조직에 필요한 앱을
> 붙이면 됩니다 — [CONTRIBUTING.md](./CONTRIBUTING.md)

## AI 보조 기능 — 상용 API 없이도 동작합니다

자산 실사의 **핵심 기능(QR 스캔·조회·엑셀 병합·검수·통계)은 AI를 쓰지 않습니다.**
AI는 장부·현물 대조 교차검증 등 선택적 보조 기능에만 쓰입니다.

AI 프록시는 OpenAI 호환 규격으로 요청하며 `/responses` 실패 시 `/chat/completions` 로
폴백합니다. 이는 **Ollama · llama.cpp · vLLM · LM Studio가 공통으로 노출하는 규격**이므로,
설정에서 base URL만 바꾸면 직접 내려받은 오픈웨이트 모델(Qwen2.5, Gemma, Llama 등)로
같은 기능이 작동합니다.

```
ai_openai_base_url = http://localhost:11434/v1   # Ollama
ai_openai_model    = qwen2.5:7b
```

자세한 설정과 동작 검증 기록은 [doc/LOCAL_MODEL.md](doc/LOCAL_MODEL.md) 참고.

## 문서

- [doc/apps/](doc/apps/README.md) — 앱별 실행 순서·메뉴얼. **기능을 바꾸면 같은 작업에서 문서도 갱신합니다.**
- [doc/PRD.md](doc/PRD.md) — 제품 요구사항
- [doc/SETUP.md](doc/SETUP.md) — 개발 환경 구성
- [doc/REMOTE_APPS.md](doc/REMOTE_APPS.md) — **앱 만들기 · 제출 · 심사 (재빌드 없이 앱 추가)**
- [examples/app-template/](examples/app-template/) — 앱 템플릿 (JSX·빌드·제출 전 검증)
- [doc/LOCAL_MODEL.md](doc/LOCAL_MODEL.md) — 로컬 오픈웨이트 모델 구동
- [THIRD_PARTY.md](THIRD_PARTY.md) — 제3자 오픈소스 고지 (SBOM)

## 데이터 취급

이 저장소에는 **실제 자산 데이터가 포함되지 않습니다.** 다음 경로는 `.gitignore`로 추적에서 제외됩니다.

- `ai-hub-web/server/data/` — SQLite DB (자산 데이터셋, 조사 세션, 계정)
- `ai-hub-web/server/uploads/` — 업로드된 엑셀 원본
- `ai-hub-web/server/backups/`, `ai-hub-web/server/logs/`
- `ai-hub-web/public/datasets/` — 샘플 템플릿만 추적

현물 사진은 서버로 전송되지 않고 기기 IndexedDB에만 저장됩니다.

## 함께 만들기

새로운 앱, 다른 자산 유형(전산장비·도서·실험기자재) 지원, 로컬 모델 연동 확장, 버그 제보 —
무엇이든 환영합니다. [CONTRIBUTING.md](./CONTRIBUTING.md) 에 시작 방법을 정리해 두었습니다.

특히 **다른 회사의 실제 데이터에서 깨지는 경우**의 제보가 가장 값집니다.
이 프로젝트 자체가 "자산번호에 하이픈이 있고 없고"처럼 데이터를 열어봐야만
보이는 문제에서 출발했습니다.

## 라이선스

[MIT](./LICENSE). 직접 의존성 60개가 모두 MIT / Apache-2.0 / BSD 계열이며 **카피레프트 의존성이 없습니다.**
제약 없이 가져다 쓰고, 고치고, 재배포하실 수 있습니다.
