# 사내 휴일 관리 기능 (Company Holidays Feature)

## 개요 (Overview)

이 기능은 관리자가 사내 휴일을 추가, 수정, 삭제할 수 있고, 모든 사용자가 휴일 정보를 확인할 수 있는 시스템입니다.

## 주요 기능 (Key Features)

### 1. 자동 생성된 격주 금요일 휴일
- **기준일**: 2026년 6월 12일
- **주기**: 2주 단위 금요일마다 자동으로 사내 휴일 생성
- **범위**: 향후 2년간 (총 52개의 휴일)

### 2. 관리자 기능
- ✅ 휴일 추가
- ✅ 휴일 수정
- ✅ 휴일 삭제
- ✅ 휴일 목록 조회 (연도/월별 필터링)

### 3. 사용자 기능
- ✅ 휴일 목록 조회
- ✅ 캘린더 뷰로 휴일 확인
- ✅ 연도/월별 필터링

## 구현된 파일 (Implemented Files)

### 1. 데이터베이스 마이그레이션
**파일**: `supabase/migrations/20260605100000_company_holidays.sql`

- `company_holidays` 테이블 생성
- Row Level Security (RLS) 정책 설정
  - 모든 사용자: 휴일 조회 가능
  - 관리자만: 휴일 추가/수정/삭제 가능
- 2026년 6월 12일부터 2주 단위 금요일 휴일 자동 생성

### 2. TypeScript 타입 정의
**파일**: `src/types/holiday.ts`

```typescript
- CompanyHoliday: 휴일 데이터 타입
- CreateHolidayInput: 휴일 생성 입력 타입
- UpdateHolidayInput: 휴일 수정 입력 타입
```

### 3. 서비스 레이어
**파일**: `src/lib/holidayService.ts`

주요 함수:
- `getHolidays()`: 모든 휴일 조회
- `getHolidaysByDateRange()`: 날짜 범위로 휴일 조회
- `getHolidaysByMonth()`: 특정 연월의 휴일 조회
- `createHoliday()`: 휴일 생성 (관리자)
- `updateHoliday()`: 휴일 수정 (관리자)
- `deleteHoliday()`: 휴일 삭제 (관리자)
- `isHoliday()`: 특정 날짜가 휴일인지 확인
- `getHolidayByDate()`: 특정 날짜의 휴일 정보 조회

### 4. UI 컴포넌트

#### HolidaysPage (`src/pages/HolidaysPage.tsx`)
- 휴일 목록 테이블 뷰
- 연도/월별 필터링
- 관리자: 휴일 추가/수정/삭제 폼
- 사용자: 휴일 목록 조회

#### HolidayCalendar (`src/components/HolidayCalendar.tsx`)
- 월별 캘린더 뷰
- 휴일 표시 (빨간색 배경)
- 오늘 날짜 강조
- 주말 색상 구분 (일요일: 빨강, 토요일: 파랑)
- 이번 달 휴일 목록 표시

### 5. 라우팅 및 네비게이션
**파일**: 
- `src/App.tsx`: `/holidays` 라우트 추가
- `src/components/AppLayout.tsx`: 네비게이션 메뉴에 "Holidays" 링크 추가

## 데이터베이스 스키마 (Database Schema)

```sql
CREATE TABLE company_holidays (
  id UUID PRIMARY KEY,
  holiday_date DATE NOT NULL UNIQUE,
  holiday_name VARCHAR(255) NOT NULL,
  description TEXT,
  is_recurring BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
);
```

## 권한 관리 (Permissions)

### RLS 정책 (Row Level Security Policies)

1. **조회 (SELECT)**: 모든 인증된 사용자
2. **추가 (INSERT)**: 관리자만 (`role = 'admin'`)
3. **수정 (UPDATE)**: 관리자만 (`role = 'admin'`)
4. **삭제 (DELETE)**: 관리자만 (`role = 'admin'`)

## 설치 및 실행 (Installation & Setup)

### 1. 데이터베이스 마이그레이션 적용

```bash
# Docker Desktop이 실행 중인지 확인
# Supabase 로컬 환경 시작
cd ai-hub-web
supabase start

# 마이그레이션 적용
supabase db reset
```

### 2. 개발 서버 실행

```bash
cd ai-hub-web
npm run dev
```

### 3. 접속 및 테스트

1. 브라우저에서 `http://localhost:5173` 접속
2. 관리자 계정으로 로그인
3. 네비게이션에서 "Holidays" 클릭
4. 휴일 관리 기능 테스트

## 사용 방법 (Usage)

### 관리자 (Admin)

#### 휴일 추가
1. "Holidays" 페이지 접속
2. "+ 휴일 추가" 버튼 클릭
3. 폼 작성:
   - 날짜 선택
   - 휴일 이름 입력
   - 설명 입력 (선택사항)
   - 반복 휴일 체크 (선택사항)
4. "추가" 버튼 클릭

#### 휴일 수정
1. 휴일 목록에서 "수정" 버튼 클릭
2. 정보 수정
3. "수정" 버튼 클릭

#### 휴일 삭제
1. 휴일 목록에서 "삭제" 버튼 클릭
2. 확인 대화상자에서 "확인" 클릭

### 일반 사용자 (User)

#### 휴일 조회
1. "Holidays" 페이지 접속
2. 연도/월 필터 선택
3. 휴일 목록 확인

## 기술 스택 (Tech Stack)

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Backend**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **State Management**: React Context API

## 특징 (Features)

### 자동화
- 2026년 6월 12일부터 2주 단위 금요일 휴일 자동 생성
- 향후 2년간의 휴일 미리 생성

### 보안
- Row Level Security (RLS)로 권한 관리
- 관리자만 휴일 추가/수정/삭제 가능
- 모든 사용자는 조회만 가능

### 사용자 경험
- 직관적인 UI/UX
- 연도/월별 필터링
- 캘린더 뷰 제공
- 반응형 디자인

## 향후 개선 사항 (Future Improvements)

1. **캘린더 통합**: Dashboard에 캘린더 위젯 추가
2. **알림 기능**: 다가오는 휴일 알림
3. **휴일 카테고리**: 법정 휴일, 사내 휴일 등 구분
4. **휴일 통계**: 연간 휴일 통계 대시보드
5. **엑셀 내보내기**: 휴일 목록 엑셀 다운로드
6. **휴일 가져오기**: 공휴일 API 연동

## 문제 해결 (Troubleshooting)

### Docker가 실행되지 않는 경우
```bash
# Docker Desktop 설치 및 실행 확인
# https://docs.docker.com/desktop/
```

### 마이그레이션 오류
```bash
# 마이그레이션 상태 확인
supabase migration list

# 특정 마이그레이션 재실행
supabase db reset
```

### 권한 오류
- 관리자 계정으로 로그인했는지 확인
- `ai_hub_memberships` 테이블에서 `role = 'admin'` 확인

## 라이선스 (License)

이 프로젝트는 AI HUB 프로젝트의 일부입니다.