# 로컬 실행 방법

## 사전 요구사항

- Node.js
- npm

## 설치

프로젝트 의존성이 이미 설치되어 있지 않다면 다음 명령을 실행합니다.

```powershell
npm install --prefix ai-hub-web
```

## 개발 서버 실행

루트 폴더에서 실행:

```powershell
npm run dev
```

또는 웹 프로젝트 폴더에서 실행:

```powershell
cd ai-hub-web
npm run dev
```

## 접속 주소

```text
https://localhost:5173/
```

브라우저에서 자체 서명 인증서 경고가 표시될 수 있습니다. 로컬 개발 환경에서는 계속 진행을 선택해 접속합니다.

## 빌드

```powershell
npm run build
```

## 미리보기

```powershell
npm run preview
```

