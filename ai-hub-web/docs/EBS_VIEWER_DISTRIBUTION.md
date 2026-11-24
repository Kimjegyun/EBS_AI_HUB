# EBS Viewer 배포 준비 및 자료실 등록

이 절차는 `Kimjegyun/ebs-viewer` 릴리스를 AI Hub 서버의 공개 파일 경로로 동기화하고, 파일을 확인한 다음 AI Hub 유틸리티 자료실에 등록하기 위한 운영 안내입니다. EBS Viewer 애플리케이션과 릴리스 자산은 별도 저장소에서 관리합니다. 자료실과 다운로드 폴더에는 최신 버전만 유지합니다.

## 1. 서버 PC에서 릴리스 파일 동기화

1. GitHub fine-grained personal access token을 만듭니다.
   - Repository access: **Only select repositories** → `ebs-viewer`
   - Permissions: **Contents: Read-only**
   - 토큰은 설치 프로그램에만 입력하고 채팅, 저장소 파일, 로그에 기록하지 않습니다.
2. 지정된 GitHub 릴리스에서 `ebs-viewer-server-kit.zip`을 내려받아 압축을 풉니다.
3. 관리자 PowerShell에서 압축을 푼 폴더로 이동해 설치 스크립트를 실행합니다.

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install-server.ps1
   ```

4. 프롬프트에는 다음 값을 입력합니다.
   - 저장소: 기본값 `Kimjegyun/ebs-viewer`
   - 릴리스: 게시할 GitHub 릴리스 태그 (설치 프로그램이 묻는 경우)
   - 게시 폴더: `D:\!!__AI_HUB\ai-hub-web\.utility-files`
   - GitHub 토큰: 1단계에서 만든 토큰
   - 허브 토큰: 설치 프로그램이 Hub 자동 등록을 요청하는 경우에만 입력합니다. 토큰을 저장소에 넣지 않습니다.

## 2. 웹 경로 확인

AI Hub 게이트웨이는 `UTILITY_FILES_DIR` 환경 변수가 없으면 위의 게시 폴더를 `/files/util/` 경로로 제공합니다. `start:aihub` 실행 시 저장소 루트의 `.utility-files` 폴더를 생성합니다. 이 폴더는 Git과 포털 빌드에서 제외됩니다. `version.json`은 캐시되지 않으며, 다운로드 자산은 최대 1시간 캐시됩니다.

서버 PC에서 다음 주소를 확인합니다.

```text
http://localhost:3002/files/util/version.json
```

외부 주소도 확인합니다.

```text
https://ebs-aihub.com/files/util/version.json
```

서버킷이 파일을 동기화하기 전에는 `version.json` 응답이 404인 것이 정상입니다. 동기화 후 `version.json`과 `mac.json`이 같은 최신 버전을 가리키고, manifest가 가리키는 Windows·Mac 파일 URL이 HTTP 200으로 열리는지 확인합니다. `/files/util/`은 디렉터리 목록을 노출하지 않으므로 manifest가 가리키는 파일 URL을 확인해야 합니다.

## 3. 유틸리티 자료실 등록

파일의 실제 이름과 manifest 다운로드 경로를 확인한 다음 관리자 화면에서 새 유틸리티를 발행합니다.

- 관리자 자료실 관리: `/admin/util`
- 사용자 자료실: `/user/util`
- 주소 ID: `ebs-viewer`
- 버전: GitHub 릴리스의 버전
- 제목: `EBS Viewer`
- 분류: `문서 뷰어`
- 실행 / 다운로드 주소: `version.json`이 가리키는 실제 설치 파일의 `/files/util/<파일명>` 경로
- 기능, 사용법, 변경 내용: 공개할 기능과 설치 방법을 작성합니다.

실제 설치 파일 경로를 확인하기 전에는 임의의 파일명이나 `version.json` 자체를 다운로드 링크로 등록하지 마세요. 새 EBS Viewer 버전을 발행하면 자료실은 최신 항목으로 교체되고 이전 버전 기록은 제거됩니다. 서명된 최신 manifest의 Windows·Mac 파일이 모두 확인된 경우 이전 EBS Viewer 설치 파일도 다운로드 폴더에서 정리됩니다.

## 운영 경계

- GitHub 토큰은 `ebs-viewer` 읽기 전용으로 제한하고 서버킷 설치 PC에만 입력합니다.
- `.utility-files`는 런타임 게시 폴더입니다. 앱 빌드 산출물이나 Git 추적 파일에 릴리스 바이너리를 복사하지 않습니다.
- 자료실 등록은 AI Hub 관리자 기능입니다. EBS Viewer 저장소나 애플리케이션 코드를 이 저장소에서 수정하지 않습니다.
- 서버킷 설치와 외부 GitHub 인증은 서버 PC 운영자가 로컬에서 완료해야 합니다. 설치 토큰은 로그 또는 자료실 본문에 넣지 않습니다.
