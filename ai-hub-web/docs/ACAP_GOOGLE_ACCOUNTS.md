# ACAP Google 계정 및 저장소 운영 정보

확인일: 2026-10-17 (한국 시간)

이 문서는 사용자가 확인해 준 계정의 역할과 프로그램에서 확인한 설정 상태를 구분해 기록한다. 비밀번호, API 키, Client Secret, 인증 코드, 액세스 토큰, 갱신 토큰은 기록하지 않는다.

계정 연결·공통 설정 관리의 담당 저장소는 AI Hub(`D:\!!__AI_HUB\ai-hub-web`)다. ACAP(`D:\EBS_AI_CONTENTS_CREATION_v2`)는 이 설정을 이용하는 콘텐츠 제작 프로그램이다. 아래 로컬 ACAP 설정 절차는 현재 남아 있는 구현의 운영 방법이며, 공통 설정 기능의 AI Hub 이관이 완료되었다는 뜻은 아니다. [개발 책임 구분](DEVELOPMENT_BOUNDARIES.md)을 따른다.

## 계정 역할

| 구분 | 계정 | 용도 | 확인 근거 |
| --- | --- | --- | --- |
| Google Cloud 콘솔 관리 | aitopia777@gmail.com | ACAP에서 사용하는 Google Cloud 프로젝트와 OAuth 클라이언트 설정 관리 | 사용자 제공 정보 |
| Google Drive 저장용 | talktalktv2@gmail.com | 관리자가 연결한 공용 저장소의 Drive 계정. 사용자별 프로젝트·이미지·음성·영상 저장 | 사용자 제공 정보와 실제 Google Drive 계정 조회로 일치 확인 |

두 계정의 역할은 다르며, 동일한 이메일로 통일할 필요는 없다. 프로그램의 사용자 ID·비밀번호 로그인 계정과도 별개다. Cloud 콘솔 관리 계정은 사용자 제공 정보이며, Drive 저장용 계정은 인증 후 실제 계정 조회로 확인했다.

## 현재 확인한 상태

2026-10-17 로컬 서버의 상태 API를 조회한 결과:

| 항목 | 상태 |
| --- | --- |
| 서버 Google OAuth 클라이언트 설정 | 등록됨 (`googleClientConfigured: true`) |
| 프로그램의 특정 Google 이메일 제한 | 비활성 (`allowedEmailEnforced: false`) |
| 외부 사용자용 공용 Drive 저장소 | 활성 (`enabled: true`) |
| 공용 Drive 저장소 연결 상태 | 연결됨 (`connected: true`) |
| 실제 Drive 연결 계정 | `talktalktv2@gmail.com` 일치 확인 |
| 저장 루트 폴더 | `EBS AI ACAP 저장소`, 쓰기 가능 확인 |

OAuth 설정, Drive 연결, 공용 저장소 활성화를 각각 확인했다. 상태 API의 활성·연결 상태와 별도로 Google Drive API에서 저장용 계정 이메일 및 폴더의 쓰기 가능 여부를 확인했다. 기존 사용자 연결과 프로젝트는 변경하지 않았다. 외부 사용자의 실제 아이디 로그인과 파일 저장은 해당 사용자의 첫 접속에서 확인한다.

## 관리자 설정 위치와 절차

- 외부 사용자 접속: `https://ebs-aihub.com/ACAP/`
- 관리자 초기 설정: 프로그램이 실행 중인 서버 PC의 `http://localhost:8081/ACAP/`
- 승인된 JavaScript 원본: `http://localhost:8081`
- 승인된 리디렉션 URI: `http://localhost:8081/ACAP/auth/callback`
- 서버의 허용 Origin: `https://ebs-aihub.com,http://localhost:8081,http://127.0.0.1:8081`

2026-10-17 복귀 오류 복구: `허용되지 않은 Origin입니다.`는 이 서버의 `GOOGLE_ALLOWED_ORIGINS`가 외부 도메인만 포함해 로컬 복귀 요청을 차단한 오류였다. 기존 외부 주소를 유지하고 위 로컬 주소를 추가했으며, 로컬 요청의 Origin 검사 통과와 다른 출처 차단을 확인했다. Google 계정이나 Client Secret은 교체하지 않았다. 이전 요청은 연결을 저장하기 전에 중단되었으므로 오류 화면을 새로고침하지 말고 메인에서 Drive 장기 연결을 새로 시작한다.

같은 날 메인 복귀 시 `/ACAP` 주소에서 Vite의 public base URL 안내가 나타나는 문제도 확인했다. 원격 ACAP의 로컬 서버와 공개 진입 경로가 `/ACAP`을 `/ACAP/`로 자동 연결하도록 맞췄고, 인증 오류 화면의 메인 링크도 끝의 `/`를 유지하도록 수정했다. 이 안내는 Google 계정 오류가 아니다.

1. Cloud 콘솔 관리 계정으로 현재 ACAP OAuth 클라이언트에 위 원본과 리디렉션 URI가 등록되어 있는지 확인한다. 기존에 필요한 다른 주소는 유지한다.
2. 서버 PC의 로컬 ACAP에서 `인증 · API 설정 → Google API 설정`을 열고, 저장용 Drive 계정으로 Google 연결과 Drive·Sheets 권한 승인을 완료한다.
3. `ACAP Drive 저장소`에서 `현재 Google 연결로 Drive 저장소 사용 시작`을 누른다.
4. 로컬 화면에서 저장소 사용 중 표시를 확인한다. 서버 상태의 `enabled`, `connected`가 모두 `true`인지 확인한다.
5. 승인된 외부 사용자로 로그인해 상단 `구글 드라이브 저장폴더`에서 본인의 폴더가 표시되고 저장·조회되는지 확인한다.

현재 구현은 Drive 연결 후 전용 `EBS AI ACAP 저장소` 폴더를 생성하거나 재사용하고 그 아래에 사용자별 폴더를 운영한다. 임의의 기존 Drive 폴더를 지정한 상태로 기록한 것은 아니다.

## 외부 사용자 권한

승인된 외부 사용자는 위 관리 설정을 이용해 제작 API와 본인의 저장소를 사용한다. 별도의 개인 Google 인증은 요구하지 않는다. 공용 저장소 활성화는 완료됐으며, 각자의 AI Hub 아이디·비밀번호로 원격 ACAP에 로그인해 이용한다.

| 기능 | 외부 USER·ADMIN |
| --- | --- |
| 아이디·비밀번호로 ACAP 로그인 | 계정 승인·권한 확인 후 허용 |
| 관리자가 연결한 Drive의 본인 폴더 저장·조회 | 공용 저장소 활성화 후 허용 |
| 다른 사용자의 폴더 또는 관리자 개인 Drive 파일 접근 | 서버에서 차단 |
| 인증·API 설정 열람·변경, API 키 조회·복사·설정 내보내기 | 원격 화면 잠금 및 서버 접근 제한 |
| Google 계정 재연결 또는 공용 저장소 재설정 | 원격에서 차단, 서버 PC에서 관리 |
| 서버 `.private`·`PRIVATE` 파일 및 비밀 설정 다운로드 | 공개 HTTP 경로에서 차단 |

원격 ADMIN도 ACAP 인증·API 설정을 변경할 수 없다. 웹에서의 파일 접근 차단은 서버 실행 계정이나 Windows 관리자의 직접 파일시스템 접근 권한까지 제거하는 기능은 아니다.

구현 확인 위치: ACAP 저장소의 `server/remoteSecurity.mjs`, `server/app.mjs`, `server/credentials.mjs`, `server/testWorkspace.mjs`, `server/privateFiles.mjs`, `server/portalStatic.mjs`. 운영 경계에 대한 설명은 이 저장소의 [CLOUDFLARE_PORTALS.md](CLOUDFLARE_PORTALS.md)를 참고한다.
