# EBS AI Hub

EBS AI Hub는 공통 로그인·권한·프로그램 등록과 실행을 제공하는 플랫폼입니다.

## 외부 앱 개발자

AI Hub 마켓플레이스에 등록할 브라우저 앱을 만들려면 [`developer-kit/`](developer-kit/)의 외부 개발자 킷을 사용하세요. 공개 다운로드 페이지는 배포 후 `https://ebs-aihub.com/developer-kit/`에서 열 수 있습니다.

## 개발 및 운영 문서

- [앱 패키징 파이프라인](docs/IMPORT_PROGRAM_PIPELINE.md): 저장소 내부 소스를 가져와 패키징하는 절차
- [외부 앱 개발 가이드](developer-kit/APP_DEVELOPER_GUIDE.md): 독립 개발자용 앱 계약과 제출 절차
- [개발 책임 구분](docs/DEVELOPMENT_BOUNDARIES.md): AI Hub와 ACAP 제품의 소유 범위
- [개발 상태](docs/DEVELOPMENT_STATUS.md): 저장소와 현재 개발 대상

## 개발 환경

Node.js와 npm을 준비한 뒤 의존성을 설치합니다.

```sh
npm install
npm run dev:user
```

로컬 개발 서버와 외부 포털을 함께 시작하려면 `npm run start:aihub`를 실행합니다. 이 명령은 수정된 소스에서 안전한 공개 포털 빌드를 만든 뒤 로컬 개발 서버와 외부 게이트웨이·터널을 시작합니다. 로컬 개발 서버는 저장 즉시 갱신되며, 외부 포털은 다음 `start:aihub` 실행 때 새 공개 빌드로 갱신됩니다.

프로덕션 빌드는 `npm run build`로 실행할 수 있습니다.
