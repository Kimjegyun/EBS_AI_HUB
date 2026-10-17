# ACAP Google 계정 및 저장소 운영 정보

확인일: 2026-10-17 (한국 시간)

이 문서는 사용자가 확인해 준 계정의 역할과 프로그램에서 확인한 설정 상태를 구분해 기록한다. 비밀번호, API 키, Client Secret, 인증 코드, 액세스 토큰, 갱신 토큰은 기록하지 않는다.

계정 연결·공통 설정 관리의 담당 저장소는 AI Hub(`D:\!!__AI_HUB\ai-hub-web`)다. ACAP(`D:\EBS_AI_CONTENTS_CREATION_v2`)는 이 설정을 이용하는 콘텐츠 제작 프로그램이다. 아래 로컬 ACAP 설정 절차는 현재 남아 있는 구현의 운영 방법이며, 공통 설정 기능의 AI Hub 이관이 완료되었다는 뜻은 아니다. [개발 책임 구분](DEVELOPMENT_BOUNDARIES.md)을 따른다.

## 계정 역할

| 구분 | 계정 | 용도 | 확인 근거 |
| --- | --- | --- | --- |
| Google Cloud 콘솔 관리 | aitopia777@gmail.com | ACAP에서 사용하는 Google Cloud 프로젝트와 OAuth 클라이언트 설정 관리 | 사용자 제공 정보 |
| Google Drive 저장용 | talktalktv2@gmail.com | 관리자가 연결할 공용 저장소의 Drive 계정. 사용자별 프로젝트·이미지·음성·영상 저장 | 사용자 제공 정보. 이전 Drive 인증 오류 화면에서도 선택된 계정 확인 |

두 계정의 역할은 다르며, 동일한 이메일로 통일할 필요는 없다. 프로그램의 사용자 ID·비밀번호 로그인 계정과도 별개다. 위 이메일 기록은 설정 변경이나 Google 인증 완료를 의미하지 않는다.

## 현재 확인한 상태

2026-10-17 로컬 서버의 상태 API를 조회한 결과:

| 항목 | 상태 |
| --- | --- |
| 서버 Google OAuth 클라이언트 설정 | 등록됨 (`googleClientConfigured: true`) |
| 프로그램의 특정 Google 이메일 제한 | 비활성 (`allowedEmailEnforced: false`) |
| 외부 사용자용 공용 Drive 저장소 | 아직 비활성 (`enabled: false`) |
| 공용 Drive 저장소 연결 상태 | 아직 연결되지 않음 (`connected: false`) |

OAuth 설정이 있다는 것과 Drive 연결·공용 저장소 활성화가 완료됐다는 것은 별개다. 상태 API는 Google Cloud 콘솔에 로그인한 계정이나 연결된 Google 계정 이메일을 반환하지 않으므로, 이메일은 사용자 제공 정보로 기록했다. 현재 비활성인 공용 저장소에 실제 사용자 파일이 저장되고 있다고 판단하지 않는다.

## 관리자 설정 위치와 절차

- 외부 사용자 접속: `https://ebs-aihub.com/ACAP/`
- 관리자 초기 설정: 프로그램이 실행 중인 서버 PC의 `http://localhost:8081/ACAP/`
- 승인된 JavaScript 원본: `http://localhost:8081`
- 승인된 리디렉션 URI: `http://localhost:8081/ACAP/auth/callback`

1. Cloud 콘솔 관리 계정으로 현재 ACAP OAuth 클라이언트에 위 원본과 리디렉션 URI가 등록되어 있는지 확인한다. 기존에 필요한 다른 주소는 유지한다.
2. 서버 PC의 로컬 ACAP에서 `인증 · API 설정 → Google API 설정`을 열고, 저장용 Drive 계정으로 Google 연결과 Drive·Sheets 권한 승인을 완료한다.
3. `ACAP Drive 저장소`에서 `현재 Google 연결로 Drive 저장소 사용 시작`을 누른다.
4. 로컬 화면에서 저장소 사용 중 표시를 확인한다. 서버 상태의 `enabled`, `connected`가 모두 `true`인지 확인한다.
5. 승인된 외부 사용자로 로그인해 상단 `구글 드라이브 저장폴더`에서 본인의 폴더가 표시되고 저장·조회되는지 확인한다.

현재 구현은 Drive 연결 후 전용 `EBS AI ACAP 저장소` 폴더를 생성하거나 재사용하고 그 아래에 사용자별 폴더를 운영한다. 임의의 기존 Drive 폴더를 지정한 상태로 기록한 것은 아니다.

## 외부 사용자 권한

승인된 외부 사용자는 위 관리 설정을 이용해 제작 API와 본인의 저장소를 사용한다. 별도의 개인 Google 인증은 요구하지 않는다. 다만 현재는 공용 저장소 활성화가 남아 있으므로, 관리자 설정 완료 후 이용할 수 있다.

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
