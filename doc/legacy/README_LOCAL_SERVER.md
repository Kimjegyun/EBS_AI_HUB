# AI HUB Local Server 설치 및 실행 가이드

## 🚀 빠른 시작 (자동 설치)

### 1단계: 자동 설치 스크립트 실행

PowerShell에서 다음 명령어를 실행하세요:

```powershell
cd ai-hub-web
.\auto-setup-server.ps1
```

이 스크립트는 자동으로:
- 모든 서버 디렉토리 생성
- 필요한 모든 파일 생성
- npm 패키지 설치
- 환경 설정 파일 생성

### 2단계: 서버 실행

```powershell
cd server
npm run dev
```

서버가 `http://localhost:3001`에서 실행됩니다.

### 3단계: 프론트엔드 실행

새 터미널을 열고:

```powershell
cd ai-hub-web
npm run dev
```

프론트엔드가 `http://localhost:3000`에서 실행됩니다.

---

## 📋 수동 설치 (선택사항)

자동 설치가 실패한 경우 수동으로 설치할 수 있습니다.

### 1. 서버 디렉토리 생성

```powershell
cd ai-hub-web
mkdir server\src\config, server\src\controllers, server\src\middleware, server\src\models, server\src\routes, server\src\services, server\src\utils, server\data, server\logs
```

### 2. 패키지 설치

```powershell
cd server
npm install
```

### 3. 환경 변수 설정

`server/.env` 파일을 생성하고 다음 내용을 추가:

```env
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
JWT_SECRET=your-secret-key-here
DATABASE_PATH=./data/aihub.db
CORS_ORIGIN=http://localhost:3000
```

---

## 🔧 시스템 구조

```
ai-hub-web/
├── server/                    # 백엔드 서버
│   ├── src/
│   │   ├── config/           # 데이터베이스 설정
│   │   ├── controllers/      # API 컨트롤러
│   │   ├── middleware/       # 인증, 에러 처리
│   │   ├── routes/           # API 라우트
│   │   ├── services/         # 비즈니스 로직
│   │   └── utils/            # 유틸리티
│   ├── data/                 # SQLite 데이터베이스
│   ├── logs/                 # 로그 파일
│   └── package.json
├── src/                      # 프론트엔드
└── auto-setup-server.ps1     # 자동 설치 스크립트
```

---

## 👥 계정 체계

### 1. 관리자 (Admin)
- 기본 계정: `admin@company.com` / `admin123`
- 전체 시스템 관리 권한
- 사용자 승인/거부
- 휴일 및 이벤트 관리

### 2. 사용자 (User)
- 일반 직원 계정
- AI 도구 사용
- 개인 일정 관리

### 3. 협력사 (Partner)
- 외부 협력사 계정
- 제한된 접근 권한
- 프로젝트별 권한 관리

---

## 🔌 API 엔드포인트

### 인증
- `POST /api/auth/login` - 로그인
- `POST /api/auth/signup` - 회원가입
- `POST /api/auth/logout` - 로그아웃

### 사용자 관리 (Admin 전용)
- `GET /api/users` - 사용자 목록
- `GET /api/users/:id` - 사용자 상세
- `PUT /api/users/:id` - 사용자 수정
- `DELETE /api/users/:id` - 사용자 삭제
- `POST /api/users/:id/approve` - 사용자 승인
- `POST /api/users/:id/reject` - 사용자 거부

### 휴일 관리
- `GET /api/holidays` - 휴일 목록
- `POST /api/holidays` - 휴일 추가 (Admin)
- `PUT /api/holidays/:id` - 휴일 수정 (Admin)
- `DELETE /api/holidays/:id` - 휴일 삭제 (Admin)

### 이벤트 관리
- `GET /api/events` - 이벤트 목록
- `POST /api/events` - 이벤트 추가
- `PUT /api/events/:id` - 이벤트 수정
- `DELETE /api/events/:id` - 이벤트 삭제

---

## 🔒 보안

- JWT 토큰 기반 인증
- bcrypt 비밀번호 암호화
- CORS 설정
- Rate Limiting
- SQL Injection 방지

---

## 🗄️ 데이터베이스

- **타입**: SQLite (로컬 파일 기반)
- **위치**: `server/data/aihub.db`
- **백업**: 자동 백업 기능 포함

### 데이터베이스 초기화

```powershell
cd server
npm run dev
```

첫 실행 시 자동으로 데이터베이스와 테이블이 생성됩니다.

---

## 📝 로그

로그 파일은 `server/logs/` 디렉토리에 저장됩니다:
- `error.log` - 에러 로그
- `combined.log` - 전체 로그

---

## 🔄 개발 워크플로우

### 1. 서버 개발
```powershell
cd server
npm run dev  # 자동 재시작 (tsx watch)
```

### 2. 프론트엔드 개발
```powershell
cd ai-hub-web
npm run dev  # Vite 개발 서버
```

### 3. 프로덕션 빌드
```powershell
# 서버 빌드
cd server
npm run build
npm start

# 프론트엔드 빌드
cd ai-hub-web
npm run build
```

---

## 🌐 네트워크 설정

### 로컬 네트워크에서 접근

1. 서버의 IP 주소 확인:
```powershell
ipconfig
```

2. `.env` 파일 수정:
```env
HOST=0.0.0.0  # 모든 네트워크 인터페이스에서 접근 허용
CORS_ORIGIN=http://192.168.x.x:3000  # 프론트엔드 주소
```

3. 방화벽 설정:
- 포트 3001 (백엔드) 허용
- 포트 3000 (프론트엔드) 허용

---

## ❓ 문제 해결

### 서버가 시작되지 않는 경우

1. 포트 충돌 확인:
```powershell
netstat -ano | findstr :3001
```

2. 다른 포트 사용:
`.env` 파일에서 `PORT=3002`로 변경

### 데이터베이스 오류

1. 데이터베이스 파일 삭제 후 재생성:
```powershell
cd server\data
del aihub.db
cd ..
npm run dev
```

### 패키지 설치 오류

1. node_modules 삭제 후 재설치:
```powershell
cd server
rmdir /s node_modules
npm install
```

---

## 📞 지원

문제가 발생하면 로그 파일(`server/logs/`)을 확인하세요.

---

## 🎯 다음 단계

1. ✅ 서버 설치 완료
2. ✅ 프론트엔드 연동
3. 🔄 관리자 계정으로 로그인
4. 🔄 사용자 승인 테스트
5. 🔄 휴일 및 이벤트 관리 테스트

---

**축하합니다! AI HUB 로컬 서버가 준비되었습니다! 🎉**