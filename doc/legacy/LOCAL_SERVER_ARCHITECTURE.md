# AI HUB Local Server Architecture

## 개요
AI HUB는 회사 로컬 서버에서 운영되는 포털 시스템으로, 관리자(Admin), 사용자(User), 협력사(Partner)의 3단계 계정 체계를 지원합니다.

## 시스템 아키텍처

### 1. 배포 구조
```
┌─────────────────────────────────────────────────────────────┐
│                    회사 로컬 네트워크                          │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              AI HUB Local Server                      │   │
│  │                                                        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │   │
│  │  │   Frontend   │  │   Backend    │  │  Database  │ │   │
│  │  │   (Vite)     │  │   (Express)  │  │  (SQLite)  │ │   │
│  │  │   Port:3000  │  │   Port:3001  │  │            │ │   │
│  │  └──────────────┘  └──────────────┘  └────────────┘ │   │
│  │                                                        │   │
│  │  Server: http://192.168.x.x or http://company.local  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  Admin   │  │   User   │  │ Partner  │                  │
│  │  Client  │  │  Client  │  │  Client  │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### 2. 계정 체계

#### 관리자 (Admin)
- 전체 시스템 관리 권한
- 사용자 및 협력사 계정 승인/거부
- 시스템 설정 관리
- 휴일 및 이벤트 관리
- 통계 및 리포트 조회

#### 사용자 (User)
- 일반 직원 계정
- AI 도구 사용
- 개인 일정 관리
- 리소스 요청

#### 협력사 (Partner)
- 외부 협력사 계정
- 제한된 AI 도구 접근
- 프로젝트별 권한 관리
- 리소스 제공 및 관리

### 3. 기술 스택

#### Frontend
- React + TypeScript
- Vite (빌드 도구)
- TailwindCSS (스타일링)
- React Router (라우팅)

#### Backend
- Node.js + Express
- TypeScript
- JWT (인증)
- bcrypt (비밀번호 암호화)

#### Database
- SQLite (로컬 배포용)
- PostgreSQL (선택적, 대규모 배포용)

### 4. 주요 기능

#### 인증 시스템
- 로컬 계정 기반 인증
- JWT 토큰 기반 세션 관리
- 역할 기반 접근 제어 (RBAC)
- 비밀번호 재설정

#### 사용자 관리
- 회원가입 승인 워크플로우
- 계정 활성화/비활성화
- 역할 변경
- 프로필 관리

#### 데이터 관리
- 로컬 데이터베이스 저장
- 백업 및 복원
- 데이터 마이그레이션

### 5. 보안

- HTTPS 지원 (프로덕션)
- JWT 토큰 만료 관리
- 비밀번호 암호화 (bcrypt)
- CORS 설정
- Rate Limiting
- SQL Injection 방지

### 6. 배포 방법

#### 개발 환경
```bash
# Backend 실행
cd ai-hub-web/server
npm install
npm run dev

# Frontend 실행
cd ai-hub-web
npm install
npm run dev
```

#### 프로덕션 환경
```bash
# 전체 빌드 및 실행
npm run build:all
npm run start:prod
```

### 7. 환경 설정

#### Backend (.env)
```
NODE_ENV=production
PORT=3001
JWT_SECRET=your-secret-key
DATABASE_PATH=./data/aihub.db
CORS_ORIGIN=http://192.168.x.x:3000
```

#### Frontend (.env)
```
VITE_API_URL=http://192.168.x.x:3001
VITE_ENVIRONMENT=local
```

### 8. 디렉토리 구조
```
ai-hub-web/
├── server/                 # Backend 서버
│   ├── src/
│   │   ├── controllers/   # API 컨트롤러
│   │   ├── models/        # 데이터 모델
│   │   ├── routes/        # API 라우트
│   │   ├── middleware/    # 미들웨어
│   │   ├── services/      # 비즈니스 로직
│   │   ├── utils/         # 유틸리티
│   │   └── index.ts       # 서버 진입점
│   ├── data/              # 데이터베이스 파일
│   ├── package.json
│   └── tsconfig.json
├── src/                    # Frontend 소스
├── public/                 # 정적 파일
├── dist/                   # 빌드 결과물
└── package.json
```

### 9. API 엔드포인트

#### 인증
- POST `/api/auth/login` - 로그인
- POST `/api/auth/signup` - 회원가입
- POST `/api/auth/logout` - 로그아웃
- POST `/api/auth/refresh` - 토큰 갱신
- POST `/api/auth/reset-password` - 비밀번호 재설정

#### 사용자 관리 (Admin)
- GET `/api/users` - 사용자 목록
- GET `/api/users/:id` - 사용자 상세
- PUT `/api/users/:id` - 사용자 수정
- DELETE `/api/users/:id` - 사용자 삭제
- POST `/api/users/:id/approve` - 사용자 승인
- POST `/api/users/:id/reject` - 사용자 거부

#### 휴일 관리
- GET `/api/holidays` - 휴일 목록
- POST `/api/holidays` - 휴일 추가
- PUT `/api/holidays/:id` - 휴일 수정
- DELETE `/api/holidays/:id` - 휴일 삭제

#### 이벤트 관리
- GET `/api/events` - 이벤트 목록
- POST `/api/events` - 이벤트 추가
- PUT `/api/events/:id` - 이벤트 수정
- DELETE `/api/events/:id` - 이벤트 삭제

### 10. 데이터베이스 스키마

#### users 테이블
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  login_id TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'user', 'partner')),
  status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
  company TEXT,
  department TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### holidays 테이블
```sql
CREATE TABLE holidays (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  is_recurring BOOLEAN DEFAULT 0,
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
```

#### events 테이블
```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  user_id TEXT NOT NULL,
  is_all_day BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 11. 로컬/클라우드 하이브리드 운영

#### 로컬 우선 전략
- 기본적으로 모든 데이터는 로컬 서버에 저장
- 인증, 사용자 관리, 이벤트 관리 등 핵심 기능은 로컬에서 처리
- 클라우드는 선택적 백업 및 동기화 용도로만 사용

#### 클라우드 연동 (선택적)
- 데이터 백업
- 외부 접근이 필요한 경우
- 재해 복구

### 12. 모니터링 및 로깅

- 서버 상태 모니터링
- API 요청 로깅
- 에러 추적
- 사용자 활동 로그

### 13. 백업 및 복구

#### 자동 백업
- 일일 데이터베이스 백업
- 백업 파일 보관 (30일)
- 백업 파일 압축

#### 복구 절차
```bash
# 백업 생성
npm run backup

# 복구
npm run restore -- --file=backup-2026-06-17.db