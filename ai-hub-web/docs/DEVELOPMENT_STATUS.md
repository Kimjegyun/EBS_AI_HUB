# 제품별 GitHub 관리 및 현재 개발 대상

사용자 지정일: 2026-10-17

**현재 개발 대상: ACAP 원격버전 (`acap-remote`).** 사용자가 대상을 바꾸기 전까지 ACAP 기능 변경은 원격버전에 적용한다. 계정·권한·공통 연결 설정의 관리 책임은 계속 AI Hub에 있다.

## 독립 저장소와 작업 폴더

| 제품 | GitHub | 기준 브랜치 | 작업 폴더 |
| --- | --- | --- | --- |
| EBS AI Hub | [EBS_AI_HUB](https://github.com/Kimjegyun/EBS_AI_HUB) | `main` | `D:\!!__AI_HUB\ai-hub-web` (Git 루트는 `D:\!!__AI_HUB`) |
| ACAP 로컬버전 | [EBS_AI_CONTENTS_CREATION_v2](https://github.com/Kimjegyun/EBS_AI_CONTENTS_CREATION_v2) | `master` | `D:\EBS_AI_CONTENTS_CREATION_LOCAL` |
| ACAP 원격버전 | [EBS_AI_CONTENTS_CREATION_REMOTE](https://github.com/Kimjegyun/EBS_AI_CONTENTS_CREATION_REMOTE) | `remote-version` | `D:\EBS_AI_CONTENTS_CREATION_v2` |

GitHub 저장소 이름은 기존 연결을 유지한다. `v2`라는 이름의 기존 폴더는 현재 원격버전 작업 폴더이므로 폴더 이름만 보고 로컬버전으로 판단하지 않는다. 로컬버전은 GitHub의 로컬용 `master`에서 독립 clone했으며 원격버전의 미커밋 변경을 복사하지 않았다.

## 다르게 적용할 개발 정책

| 구분 | EBS AI Hub | ACAP 로컬버전 | ACAP 원격버전 |
| --- | --- | --- | --- |
| 목적 | 전체 프로그램·계정·권한·연결·공통 설정 관리 | 개인 PC에서 독립 제작 | 외부 사용자의 브라우저 제작 |
| Google·API 설정 | 원격 서비스의 공통 설정 관리 | 개인 PC 소유자의 설정 | AI Hub 관리 설정을 이용 |
| 저장소 | 공통 정책 관리 | 개인 Drive·개인 PC | 관리자 Drive의 사용자별 폴더·사용자 기기의 로컬 폴더 |
| 설정 노출 | 인증된 관리 권한과 서버 정책에 따름 | PC 소유자의 설정 기능 유지 | 원격 USER·ADMIN의 인증·API 설정 잠금 유지 |
| 변경 전달 | 필요한 앱 계약만 함께 변경 | 원격 변경을 자동 병합하지 않음 | 로컬 변경을 자동 병합하지 않음 |

ACAP 원격버전의 로고·헤더·제작 화면과 저장폴더 탐색은 원격 ACAP 저장소에서 변경한다. 공통 관리 화면은 AI Hub에서 변경한다. 원격 ACAP에 남아 있는 Google 연결·공용 Drive 관리 코드는 아직 AI Hub로 이관되지 않은 기존 구현이다.

`http://localhost:8081/ACAP/`는 현재 원격버전 서버의 로컬 관리 접속 주소다. 여기를 열었다고 제품이 ACAP 로컬버전으로 바뀌지는 않는다. 새 로컬버전 clone은 현재 실행하지 않으며 서버 환경 파일·토큰·개인 프로젝트·의존성은 자동 복사하지 않았다. 로컬버전을 실행할 때는 기존 원격 서비스와 포트·설정 충돌을 별도로 확인한다.

## 커밋·push 규칙

- 각 제품의 `development-target.json`에 제품 ID, GitHub 저장소, 기준 브랜치, 기본 remote를 기록한다.
- 변경한 제품 폴더에서 `node scripts/verify-development-target.mjs`를 실행해 대상을 확인한다.
- `.githooks/pre-push`가 다른 제품의 GitHub 저장소로 향하는 push와 상대 버전의 기준 브랜치에 대한 push를 차단한다. remote 이름을 바꿔도 URL의 GitHub 저장소를 검사한다.
- 현재 원격 작업 폴더는 `remote-version` remote로 push한다. 과거 `origin` 연결은 이력 참조용으로 유지하지만 그 로컬용 저장소로 push하면 차단된다.
- 이번 분리는 개발 지침·문서·대상 검사·Git 훅에 대한 커밋으로 관리한다. 기존 미커밋 기능 변경은 섞어서 커밋하지 않는다.
- Git 훅은 clone만으로 자동 설치되지 않는다. 새 clone에서는 기존 훅을 확인한 후 ACAP는 `git config core.hooksPath .githooks`, AI Hub는 Git 루트 기준 `git config core.hooksPath ai-hub-web/.githooks`를 적용한다.
- 기능을 공통 적용할 필요가 생기면 두 버전에서 영향과 검증을 각각 판단한 뒤 명시적으로 반영한다.

계정 역할 정보는 [ACAP_GOOGLE_ACCOUNTS.md](ACAP_GOOGLE_ACCOUNTS.md), 플랫폼·앱 소유권은 [DEVELOPMENT_BOUNDARIES.md](DEVELOPMENT_BOUNDARIES.md)에 기록한다.

## 2026-10-27 · ACAP 진입 승인 확인 지연 개선

AI Hub 인증 API의 사용자 확인·회원 승인 조회를 병렬 실행하고, 같은 인증 설정/토큰의 진행 중 요청만 공유한다. 완료 승인 캐시는 두지 않으며 후속 승인 철회 확인·ID 일치·권한 거절·8초 요청 기한을 유지한다. 계정·OAuth·Google 연결 데이터는 변경하지 않았다.

기존/추가 Node 검사 6개와 실제 배포 CommonJS 모듈 검사, 전체 서버 TypeScript를 통과했다. 회귀 검사는 verify:production-feedback에 등록했다. 검토한 portalMembership 소스/실행 모듈만 백업 후 반영했고 인증 API(3003)의 PID·유휴 연결·헬스를 확인해 재시작했다. ACAP 제작 서버·공통 게이트웨이는 재시작하지 않았다.

ACAP 저장소는 승인 대기 UI·재시도 간격·SDK 네트워크 기한을 별도로 수정하고 배포했다. ACAP 배포는 d78810d2-d74e-4d78-8abc-a79850e06353이며 브라우저 시험의 연속 3회 일시 장애 복구는 약 7.1초였다. 실제 사용자의 로그인 시간/제작 완료를 확정한 것은 아니다. 상세 검증·측정·백업은 ACAP docs/production-runtime-recovery-audit.md와 tmp/hub-login-latency/, tmp/login-latency-*.log에 보관한다.


## ACAP 제작 중 인증 갱신·TLS 연결 복구 · 2026-10-27

사용자 로그의 외부 인증 갱신 시간 초과와 반복 503을 재현했다. 인증 도메인의 한 DNS 주소는 TLS가 정체되고 다른 주소는 정상 응답했다. 공통 인증 소유권에 따라 Hub에 제한된 refresh-token 중계 POST API와 명시적 게이트웨이 경로를 추가했다. 승인 조회·갱신은 DNS에서 얻은 주소에 검증된 TLS 연결을 먼저 만든 후 HTTP를 한 번 전송한다. 고정 IP·인증서 검증 우회·완료 승인 캐시·서비스 키 브라우저 전달은 하지 않는다. 갱신은 권한 승인이 아니며 기존 승인 검증을 유지한다. API 버전은 소비 SDK와 동일하고 무효 토큰과 일시 장애를 구분한다.

회귀 13개와 실제 배포 JS 7개, 전체 서버 TypeScript를 통과했다. 인증 API와 게이트웨이는 PID/포트/유휴 확인 후 반영했고 ACAP 제작 서버·터널은 유지했다. 원본 소스·실행 파일 백업은 ACAP tmp/hub-session-refresh/에 있다. 공개 갱신 경로의 합성 무효 토큰 400과 권한 검사 거절 응답을 확인했으며 실제 사용자 세션 갱신이나 제작 완료로 해석하지 않는다.

ACAP는 갱신 소비 경로와 화면 오류 진단을 별도 수정·배포했다: 0c1b9afc-a06f-4f7e-8254-1c1f472e0e0b / assets/index-KJtuo-wm.js. 기존 사용자·Google 연결·폴더·저장본은 보존했다. 모델/과금 경로는 변경하지 않았다.
