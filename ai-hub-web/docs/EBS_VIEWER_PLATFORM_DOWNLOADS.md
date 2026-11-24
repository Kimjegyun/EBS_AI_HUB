# EBS Viewer Windows·macOS 다운로드 배포

현재 공개 릴리스 자산은 다음과 같습니다.

| 플랫폼 | GitHub 릴리스 | 패키지 | 제공 상태 |
| --- | --- | --- | --- |
| Windows 10/11 x64 | [v1.0.2](https://github.com/Kimjegyun/ebs-viewer/releases/tag/v1.0.2) | `EBSViewer_Setup_1.0.2.exe` | 정식판 |
| macOS Apple Silicon, macOS 12+ | [mac-v1.0.2](https://github.com/Kimjegyun/ebs-viewer/releases/tag/mac-v1.0.2) | `EBSViewer_1.0.2_mac_arm64.zip` | 미리보기, 미공증 |
| macOS Intel, macOS 12+ | [mac-v1.0.2](https://github.com/Kimjegyun/ebs-viewer/releases/tag/mac-v1.0.2) | `EBSViewer_1.0.2_mac_x64.zip` | 미리보기, 미공증 |

## 공개 URL

- 다운로드 및 설치 안내: `https://ebs-aihub.com/files/util/index.html`
- 사용 설명서: `https://ebs-aihub.com/files/util/manual.html`
- Windows 설치 정보: `https://ebs-aihub.com/files/util/version.json`
- Windows 설치 파일: `https://ebs-aihub.com/files/util/downloads/EBSViewer_Setup_1.0.2.exe`
- Mac Apple Silicon: `https://ebs-aihub.com/files/util/downloads/EBSViewer_1.0.2_mac_arm64.zip`
- Mac Intel: `https://ebs-aihub.com/files/util/downloads/EBSViewer_1.0.2_mac_x64.zip`
- Mac 체크섬: `https://ebs-aihub.com/files/util/downloads/SHA256SUMS-mac.txt`

페이지에 Windows 설치와 PowerShell 설치, Mac 아키텍처 선택, 앱 복사, 첫 실행 및 미공증 경고를 안내합니다. Mac판은 동영상을 Quick Look/기본 플레이어로 열고 AI·MCP·자동 업데이트·이미지 편집·일괄 이름 변경을 지원하지 않습니다.

## 검증 결과

Windows 패키지 SHA-256은 GitHub의 서명된 `version.json` 및 릴리스 `release-files.json`과 일치합니다. Mac ZIP 두 개는 GitHub API가 제공한 SHA-256 digest와 일치하며 앱 번들 안의 `Info.plist`와 실행 파일을 확인했습니다. 로컬 및 `ebs-aihub.com` 공개 주소에서 세 패키지와 `version.json`이 HTTP 200으로 응답합니다.

## 자료실 게시

유틸리티 목록 등록은 공개 파일 배포와 별도의 관리자 작업입니다. `/api/utilities`의 `POST`에는 관리자 인증이 필요합니다. 게시 내용 초안은 [EBS Viewer 등록 JSON](EBS_VIEWER_UTILITY_REGISTRATION.json)에 있습니다. 실행 주소는 디렉터리 URL 대신 `https://ebs-aihub.com/files/util/index.html`을 사용합니다.
