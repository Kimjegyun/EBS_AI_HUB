# 로컬 스토리지 기반 아키텍처

## 📋 개요

AI Hub 애플리케이션은 **하이브리드 데이터 저장 방식**을 사용합니다:
- **Supabase (클라우드)**: 인증 + ADMIN 전용 데이터
- **localStorage (로컬)**: 일반 USER의 개인 데이터

---

## 🏗️ 아키텍처 설계

### 데이터 저장 전략

```
┌─────────────────────────────────────────────────────────┐
│                    AI Hub Application                    │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐              ┌──────────────┐         │
│  │   ADMIN      │              │     USER     │         │
│  │   (관리자)    │              │  (일반 사용자) │         │
│  └──────┬───────┘              └──────┬───────┘         │
│         │                             │                 │
│         ├─ 인증: Supabase             ├─ 인증: Supabase │
│         ├─ 개인 일정: Supabase        ├─ 개인 일정: localStorage │
│         └─ 회사 휴일: Supabase        └─ 회사 휴일: Supabase (읽기 전용) │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### 역할별 데이터 접근

| 데이터 유형 | ADMIN | USER |
|------------|-------|------|
| 인증 정보 | Supabase | Supabase |
| 개인 일정 | Supabase | **localStorage** |
| 회사 휴일 | Supabase (읽기/쓰기) | Supabase (읽기 전용) |
| 사용자 프로필 | Supabase | **localStorage** |

---

## 📁 파일 구조

```
src/lib/
├── supabase.ts                    # Supabase 클라이언트
├── localEventService.ts           # 로컬 스토리지 개인 일정 서비스 ✨ NEW
├── unifiedEventService.ts         # 통합 이벤트 서비스 (ADMIN/USER 분기) ✨ NEW
├── eventService.ts                # Supabase 이벤트 서비스 (ADMIN 전용)
├── holidayService.ts              # 회사 휴일 서비스 (모든 사용자)
└── localAccounts.ts               # 로컬 계정 관리
```

---

## 🔧 구현 상세

### 1. 로컬 스토리지 개인 일정 서비스

**파일**: [`src/lib/localEventService.ts`](ai-hub-web/src/lib/localEventService.ts)

```typescript
import { localEventService } from './lib/localEventService';

// 일정 조회
const events = localEventService.getPersonalEvents();

// 일정 생성
const newEvent = localEventService.createPersonalEvent({
  event_date: '2026-06-15',
  event_name: '회의',
  is_all_day: false,
});

// 일정 수정
localEventService.updatePersonalEvent(eventId, {
  event_name: '수정된 회의',
});

// 일정 삭제
localEventService.deletePersonalEvent(eventId);
```

**저장 위치**: `localStorage['ai-hub-personal-events-v1']`

**데이터 구조**:
```json
[
  {
    "id": "uuid",
    "user_id": "local-user",
    "event_date": "2026-06-15",
    "event_time": "14:00",
    "event_name": "회의",
    "description": "프로젝트 회의",
    "location": "회의실 A",
    "is_all_day": false,
    "created_at": "2026-06-09T15:00:00Z",
    "updated_at": "2026-06-09T15:00:00Z"
  }
]
```

### 2. 통합 이벤트 서비스

**파일**: [`src/lib/unifiedEventService.ts`](ai-hub-web/src/lib/unifiedEventService.ts)

사용자 역할에 따라 자동으로 적절한 저장소를 선택합니다.

```typescript
import { createUnifiedEventService } from './lib/unifiedEventService';

// 사용자 역할에 따라 서비스 생성
const eventService = createUnifiedEventService(isAdmin);

// 동일한 API로 사용 (내부적으로 자동 분기)
const events = await eventService.getPersonalEvents();
const combined = await eventService.getCombinedCalendarEvents(2026, 6);
```

**내부 동작**:
```typescript
class UnifiedEventService {
  async getPersonalEvents() {
    if (this.isAdmin) {
      return await supabaseEventService.getPersonalEvents();
    } else {
      return localEventService.getPersonalEvents();
    }
  }
}
```

### 3. 컴포넌트에서 사용

**기존 코드 (Supabase만 사용)**:
```typescript
import { eventService } from '../lib/eventService';

const events = await eventService.getPersonalEvents();
```

**새 코드 (하이브리드)**:
```typescript
import { createUnifiedEventService } from '../lib/unifiedEventService';
import { useAuth } from '../auth/AuthContext';

function MyComponent() {
  const { isAdmin } = useAuth();
  const eventService = createUnifiedEventService(isAdmin);
  
  const events = await eventService.getPersonalEvents();
}
```

---

## 💾 로컬 스토리지 키

| 키 | 설명 | 사용자 |
|----|------|--------|
| `ai-hub-personal-events-v1` | 개인 일정 | USER |
| `ai-hub-local-accounts-v1` | 로컬 계정 정보 | 모두 |
| `dashboard-layouts` | 대시보드 레이아웃 | 모두 |
| `ai-hub-admin-ui-session` | 관리자 UI 세션 | ADMIN |

---

## 🔄 데이터 마이그레이션

### Supabase → localStorage 마이그레이션

기존 Supabase 데이터를 로컬로 이동하려면:

```typescript
import { eventService } from './lib/eventService';
import { localEventService } from './lib/localEventService';

// 1. Supabase에서 데이터 가져오기
const supabaseEvents = await eventService.getPersonalEvents();

// 2. 각 이벤트를 로컬에 저장
for (const event of supabaseEvents) {
  localEventService.createPersonalEvent({
    event_date: event.event_date,
    event_time: event.event_time,
    event_name: event.event_name,
    description: event.description,
    location: event.location,
    is_all_day: event.is_all_day,
  });
}
```

### 데이터 내보내기/가져오기

```typescript
// 내보내기
const jsonData = localEventService.exportEvents();
console.log(jsonData); // JSON 문자열

// 가져오기
localEventService.importEvents(jsonData);
```

---

## 🔒 보안 고려사항

### 1. 로컬 스토리지 제한사항
- ❌ 암호화되지 않음 (브라우저 개발자 도구로 접근 가능)
- ❌ 도메인별로 격리됨 (다른 브라우저/기기 간 동기화 불가)
- ❌ 용량 제한 (일반적으로 5-10MB)

### 2. 민감한 데이터 처리
- ✅ 개인 일정: 로컬 저장 OK (민감도 낮음)
- ❌ 비밀번호: 절대 로컬 저장 금지
- ❌ 결제 정보: 절대 로컬 저장 금지

### 3. 데이터 백업
로컬 스토리지는 브라우저 캐시 삭제 시 손실될 수 있으므로:
- 정기적으로 `exportEvents()` 사용하여 백업
- 중요한 데이터는 Supabase 사용 권장

---

## 🎯 사용 시나리오

### 시나리오 1: 일반 사용자 (USER)

```typescript
// 1. 로그인 (Supabase 인증)
await supabase.auth.signInWithPassword({ email, password });

// 2. 개인 일정 추가 (localStorage)
const eventService = createUnifiedEventService(false); // isAdmin = false
await eventService.createPersonalEvent({
  event_date: '2026-06-15',
  event_name: '개인 미팅',
});

// 3. 회사 휴일 조회 (Supabase - 읽기 전용)
const holidays = await holidayService.getHolidays();

// 4. 통합 달력 표시 (개인 일정 + 회사 휴일)
const allEvents = await eventService.getCombinedCalendarEvents(2026, 6);
```

### 시나리오 2: 관리자 (ADMIN)

```typescript
// 1. 로그인 (Supabase 인증)
await supabase.auth.signInWithPassword({ email, password });

// 2. 개인 일정 추가 (Supabase)
const eventService = createUnifiedEventService(true); // isAdmin = true
await eventService.createPersonalEvent({
  event_date: '2026-06-15',
  event_name: '관리자 회의',
});

// 3. 회사 휴일 관리 (Supabase - 읽기/쓰기)
await holidayService.createHoliday({
  holiday_date: '2026-12-25',
  holiday_name: '크리스마스',
});

// 4. 통합 달력 표시
const allEvents = await eventService.getCombinedCalendarEvents(2026, 6);
```

---

## 🐛 문제 해결

### 문제 1: 로컬 데이터가 표시되지 않음

**원인**: 브라우저 캐시 삭제 또는 다른 브라우저 사용

**해결**:
```typescript
// 데이터 확인
const events = localEventService.getPersonalEvents();
console.log('Local events:', events);

// 데이터가 없으면 다시 추가
if (events.length === 0) {
  // 백업에서 복원 또는 새로 추가
}
```

### 문제 2: ADMIN 데이터가 로컬에 저장됨

**원인**: `isAdmin` 플래그가 잘못 설정됨

**해결**:
```typescript
import { useAuth } from '../auth/AuthContext';

const { isAdmin } = useAuth(); // 올바른 역할 확인
const eventService = createUnifiedEventService(isAdmin);
```

### 문제 3: 로컬 스토리지 용량 초과

**원인**: 너무 많은 데이터 저장

**해결**:
```typescript
// 오래된 일정 삭제
const events = localEventService.getPersonalEvents();
const oldEvents = events.filter(e => 
  new Date(e.event_date) < new Date('2025-01-01')
);

oldEvents.forEach(e => localEventService.deletePersonalEvent(e.id));
```

---

## 📊 성능 최적화

### 1. 로컬 스토리지 읽기 최적화

```typescript
// ❌ 나쁜 예: 매번 전체 데이터 읽기
function getEvent(id: string) {
  const allEvents = localEventService.getPersonalEvents();
  return allEvents.find(e => e.id === id);
}

// ✅ 좋은 예: 필요한 데이터만 읽기
function getEvent(id: string) {
  return localEventService.getPersonalEventById(id);
}
```

### 2. 대량 데이터 처리

```typescript
// ❌ 나쁜 예: 개별 저장
events.forEach(e => localEventService.createPersonalEvent(e));

// ✅ 좋은 예: 일괄 저장
const allEvents = localEventService.getPersonalEvents();
allEvents.push(...newEvents);
localEventService.saveEvents(allEvents);
```

---

## 🔄 향후 개선 사항

### 1. IndexedDB 마이그레이션
- localStorage (5-10MB) → IndexedDB (수백 MB)
- 더 큰 용량과 빠른 성능

### 2. 오프라인 동기화
- Service Worker 활용
- 온라인 복귀 시 Supabase와 자동 동기화

### 3. 암호화
- Web Crypto API 사용
- 민감한 데이터 암호화 저장

---

## 📚 참고 자료

- [Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Supabase 문서](https://supabase.com/docs)

---

**작성일**: 2026-06-09  
**버전**: 1.0.0  
**작성자**: Bob (AI Assistant)