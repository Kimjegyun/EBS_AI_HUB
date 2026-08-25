# Supabase 구성 가이드

## 📋 목차
1. [Supabase란?](#supabase란)
2. [프로젝트 구조](#프로젝트-구조)
3. [데이터베이스 스키마](#데이터베이스-스키마)
4. [마이그레이션 시스템](#마이그레이션-시스템)
5. [설정 방법](#설정-방법)
6. [문제 해결](#문제-해결)

---

## Supabase란?

**Supabase**는 오픈소스 Firebase 대안으로, PostgreSQL 데이터베이스를 기반으로 한 백엔드 서비스입니다.

### 주요 기능
- 🗄️ **PostgreSQL 데이터베이스**: 관계형 데이터베이스
- 🔐 **인증 시스템**: 사용자 로그인/회원가입
- 🔒 **Row Level Security (RLS)**: 행 단위 보안 정책
- 📡 **실시간 구독**: 데이터 변경 실시간 감지
- 📦 **스토리지**: 파일 업로드/다운로드

---

## 프로젝트 구조

```
ai-hub-web/
├── .env                          # Supabase 연결 정보
├── src/
│   ├── lib/
│   │   ├── supabase.ts          # Supabase 클라이언트 초기화
│   │   ├── holidayService.ts    # 회사 휴일 API
│   │   └── eventService.ts      # 개인 일정 API
│   └── types/
│       ├── holiday.ts           # 휴일 타입 정의
│       └── event.ts             # 일정 타입 정의
└── supabase/
    └── migrations/              # 데이터베이스 마이그레이션 파일
        ├── 20260602163000_core_ai_hub_memberships.sql
        ├── 20260605100000_company_holidays.sql
        └── 20260605110000_personal_events_and_notifications.sql
```

---

## 데이터베이스 스키마

### 1. `auth.users` (Supabase 기본 테이블)
사용자 인증 정보를 저장하는 Supabase 내장 테이블

```sql
auth.users
├── id (UUID)              # 사용자 고유 ID
├── email (TEXT)           # 이메일
├── encrypted_password     # 암호화된 비밀번호
└── created_at            # 생성 시간
```

### 2. `ai_hub_memberships` (사용자 멤버십)
AI Hub 사용자의 역할 및 승인 상태 관리

```sql
ai_hub_memberships
├── id (UUID)              # 멤버십 ID
├── user_id (UUID)         # auth.users 참조
├── email (TEXT)           # 이메일
├── role (TEXT)            # 'admin' 또는 'user'
├── status (TEXT)          # 'pending', 'approved', 'rejected'
├── display_name (TEXT)    # 표시 이름
├── organization (TEXT)    # 조직명 (admin만)
└── created_at            # 생성 시간
```

### 3. `company_holidays` (회사 휴일)
전사 공통 휴일 관리

```sql
company_holidays
├── id (UUID)              # 휴일 ID
├── holiday_date (DATE)    # 휴일 날짜 (UNIQUE)
├── holiday_name (TEXT)    # 휴일 이름
├── description (TEXT)     # 설명
├── is_recurring (BOOL)    # 매년 반복 여부
├── created_by (UUID)      # 생성자 (auth.users 참조)
├── created_at            # 생성 시간
└── updated_at            # 수정 시간
```

**RLS 정책:**
- ✅ 모든 사용자: 조회 가능
- ✅ Admin만: 생성/수정/삭제 가능

### 4. `personal_events` (개인 일정)
사용자별 개인 일정 관리

```sql
personal_events
├── id (UUID)              # 일정 ID
├── user_id (UUID)         # auth.users 참조
├── event_date (DATE)      # 일정 날짜
├── event_time (TIME)      # 일정 시간
├── event_name (TEXT)      # 일정 이름
├── description (TEXT)     # 설명
├── event_type (TEXT)      # 'meeting', 'task', 'reminder', 'other'
├── is_all_day (BOOL)      # 종일 일정 여부
├── created_at            # 생성 시간
└── updated_at            # 수정 시간
```

**RLS 정책:**
- ✅ 본인만: 자신의 일정 조회/생성/수정/삭제 가능

---

## 마이그레이션 시스템

### 마이그레이션이란?
데이터베이스 스키마 변경을 버전 관리하는 시스템입니다.

### 파일 명명 규칙
```
YYYYMMDDHHMMSS_description.sql
```

예: `20260605100000_company_holidays.sql`

### 마이그레이션 실행 순서

1. **`20260602163000_core_ai_hub_memberships.sql`**
   - `ai_hub_memberships` 테이블 생성
   - 사용자 역할 및 승인 시스템 구축

2. **`20260605100000_company_holidays.sql`**
   - `company_holidays` 테이블 생성
   - 격주 금요일 휴일 자동 추가 (2026.06.12부터 2년치)

3. **`20260605110000_personal_events_and_notifications.sql`**
   - `personal_events` 테이블 생성
   - 개인 일정 관리 시스템 구축

---

## 설정 방법

### 1단계: Supabase 프로젝트 생성

1. https://supabase.com 접속
2. "New Project" 클릭
3. 프로젝트 정보 입력:
   - Name: `ai-hub`
   - Database Password: 안전한 비밀번호 설정
   - Region: 가까운 지역 선택 (예: Northeast Asia)

### 2단계: 환경 변수 설정

프로젝트 생성 후 Settings → API에서 확인:

```env
# .env 파일
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3단계: 마이그레이션 실행

**방법 1: Supabase Dashboard (권장)**

1. Supabase Dashboard → SQL Editor
2. 각 마이그레이션 파일 내용을 순서대로 복사
3. RUN 버튼 클릭하여 실행

**실행 순서:**
```
1. 20260602163000_core_ai_hub_memberships.sql
2. 20260605100000_company_holidays.sql
3. 20260605110000_personal_events_and_notifications.sql
```

**방법 2: Supabase CLI (선택사항)**

```bash
# Supabase CLI 설치
npm install -g supabase

# 로그인
supabase login

# 프로젝트 연결
supabase link --project-ref your-project-id

# 마이그레이션 실행
supabase db push
```

### 4단계: 테이블 확인

Supabase Dashboard → Table Editor에서 확인:
- ✅ `ai_hub_memberships`
- ✅ `company_holidays`
- ✅ `personal_events`

---

## 데이터 흐름

### 회사 휴일 표시 흐름

```
1. Supabase Database (company_holidays 테이블)
   ↓
2. holidayService.getHolidays()
   ↓
3. eventService.getCombinedCalendarEvents()
   ↓
4. EnhancedCalendar 컴포넌트
   ↓
5. 달력에 빨간색으로 표시
```

### 개인 일정 추가 흐름

```
1. 사용자가 달력 더블클릭
   ↓
2. PersonalEventDialog 열림
   ↓
3. 일정 정보 입력 후 저장
   ↓
4. eventService.createPersonalEvent()
   ↓
5. Supabase Database (personal_events 테이블)
   ↓
6. 달력 자동 새로고침
```

---

## 문제 해결

### ❌ "relation does not exist" 에러

**원인:** 테이블이 생성되지 않음

**해결:**
1. Supabase Dashboard → SQL Editor
2. 해당 마이그레이션 파일 내용 실행
3. Table Editor에서 테이블 생성 확인

### ❌ "permission denied" 에러

**원인:** RLS 정책 문제

**해결:**
1. Supabase Dashboard → Authentication → Policies
2. 해당 테이블의 정책 확인
3. 필요시 정책 재생성

### ❌ 달력에 휴일이 표시되지 않음

**원인:** 데이터가 없거나 API 호출 실패

**해결:**
1. Supabase Dashboard → Table Editor → `company_holidays`
2. 데이터 존재 여부 확인
3. 브라우저 개발자 도구 → Network 탭에서 API 호출 확인
4. Console 탭에서 에러 메시지 확인

### ❌ "Supabase is not configured" 에러

**원인:** 환경 변수 미설정

**해결:**
1. `.env` 파일 확인
2. `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY` 설정
3. 개발 서버 재시작: `npm run dev`

---

## 유용한 SQL 쿼리

### 모든 휴일 조회
```sql
SELECT * FROM company_holidays
ORDER BY holiday_date;
```

### 특정 월의 휴일 조회
```sql
SELECT * FROM company_holidays
WHERE holiday_date >= '2026-06-01'
  AND holiday_date < '2026-07-01'
ORDER BY holiday_date;
```

### 휴일 수동 추가
```sql
INSERT INTO company_holidays (holiday_date, holiday_name, description, is_recurring)
VALUES ('2026-12-25', '크리스마스', '공휴일', true);
```

### 모든 사용자 조회
```sql
SELECT 
  m.email,
  m.display_name,
  m.role,
  m.status,
  m.organization
FROM ai_hub_memberships m
ORDER BY m.created_at DESC;
```

---

## 참고 자료

- [Supabase 공식 문서](https://supabase.com/docs)
- [PostgreSQL 문서](https://www.postgresql.org/docs/)
- [Row Level Security 가이드](https://supabase.com/docs/guides/auth/row-level-security)

---

**작성일:** 2026-06-09  
**버전:** 1.0.0