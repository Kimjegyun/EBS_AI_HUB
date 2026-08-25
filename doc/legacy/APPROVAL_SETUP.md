# AI HUB 이메일 승인 시스템 설정 가이드

## 개요

사용자가 가입 후 이메일 인증을 완료하면, 관리자에게 승인 요청 이메일이 발송됩니다. 관리자는 이메일의 버튼을 클릭하여 즉시 승인/거절할 수 있습니다.

## 시스템 구성

### 1. Edge Functions

#### `notify-admin-signup`
- **역할:** 신규 가입자 정보를 관리자에게 이메일로 전송
- **트리거:** 사용자 가입 시 자동 호출
- **기능:**
  - 승인 토큰 생성
  - 승인/거절 링크가 포함된 이메일 발송

#### `approve-user`
- **역할:** 이메일 링크를 통한 승인/거절 처리
- **엔드포인트:** `GET /functions/v1/approve-user`
- **파라미터:**
  - `user_id`: 사용자 ID
  - `action`: `approve` 또는 `reject`
  - `token`: 승인 토큰
- **기능:**
  - 토큰 검증
  - 사용자 상태 업데이트 (approved/rejected)
  - 사용자에게 결과 알림 이메일 발송
  - 결과 페이지 표시

## Supabase 설정

### 1. Edge Functions 배포

```bash
# Supabase CLI 설치 (아직 설치하지 않은 경우)
npm install -g supabase

# Supabase 프로젝트 링크
supabase link --project-ref <YOUR-PROJECT-REF>

# Edge Functions 배포
supabase functions deploy notify-admin-signup
supabase functions deploy approve-user
supabase functions deploy verify-admin-gate
supabase functions deploy ai-proxy
```

### 2. 환경 변수 설정

Supabase 대시보드에서 설정:
1. Settings → Edge Functions → Secrets
2. 다음 환경 변수 추가:

```bash
# 필수: 관리자 이메일 주소
ADMIN_NOTIFICATION_EMAIL=admin@yourcompany.com

# 필수: Resend API 키 (https://resend.com)
RESEND_API_KEY=re_xxxxxxxxxxxxx

# 선택: 발신 이메일 주소
FROM_EMAIL=AI HUB <noreply@yourcompany.com>

# 필수: 승인 토큰 HMAC 시크릿 (미설정 시 승인 메일 발송이 거부됩니다)
APPROVAL_TOKEN_SECRET=your-secure-random-string-here

# 필수: 관리자 화면 잠금 코드 (브라우저에 포함되지 않습니다)
ADMIN_ACCESS_CODE=your-admin-gate-code
```

### 3. Resend 설정

1. **Resend 계정 생성:**
   - https://resend.com 접속
   - 무료 계정 생성 (월 3,000통 무료)

2. **API 키 발급:**
   - Dashboard → API Keys
   - "Create API Key" 클릭
   - 생성된 키를 `RESEND_API_KEY`에 설정

3. **도메인 설정 (선택사항):**
   - Dashboard → Domains
   - 자체 도메인 추가 및 DNS 설정
   - `FROM_EMAIL`을 자체 도메인으로 변경

### 4. Supabase Auth 설정

1. **이메일 확인 활성화:**
   - Authentication → Providers → Email
   - "Confirm email" 토글 **ON**
   - Save

2. **이메일 템플릿 커스터마이징 (선택사항):**
   - Authentication → Email Templates
   - "Confirm signup" 템플릿 수정

## 작동 흐름

```
1. 사용자 가입
   ↓
2. Supabase 이메일 인증 메일 발송
   ↓
3. 사용자가 이메일 링크 클릭하여 인증
   ↓
4. ai_hub_ensure_membership_v2() 호출
   ↓
5. status='pending'으로 멤버십 생성
   ↓
6. notify-admin-signup 함수 호출
   ↓
7. 관리자에게 승인 요청 이메일 발송
   (승인/거절 버튼 포함)
   ↓
8. 관리자가 이메일에서 버튼 클릭
   ↓
9. approve-user 함수 실행
   ↓
10. 사용자 상태 업데이트 (approved/rejected)
    ↓
11. 사용자에게 결과 알림 이메일 발송
    ↓
12. 승인된 경우 사용자 로그인 가능
```

## 이메일 템플릿

### 관리자 승인 요청 이메일

```html
제목: [AI HUB] 신규 사용자 승인 요청: user@example.com

내용:
┌─────────────────────────────────────┐
│ 🔔 AI HUB 신규 사용자 승인 요청      │
├─────────────────────────────────────┤
│ 이메일 확인을 완료한 사용자가        │
│ 승인을 기다리고 있습니다.            │
│                                     │
│ 이메일:    user@example.com         │
│ 이름:      홍길동                   │
│ 역할:      user                     │
│ 조직:      -                        │
│                                     │
│   [✅ 승인]    [❌ 거절]            │
└─────────────────────────────────────┘
```

### 사용자 승인 알림 이메일

```html
제목: [AI HUB] 가입이 승인되었습니다

내용:
안녕하세요, 홍길동님!

AI HUB 가입이 승인되었습니다.
이제 로그인하여 서비스를 이용하실 수 있습니다.

[로그인하기]
```

## 보안 고려사항

### 1. 토큰 보안
- `APPROVAL_TOKEN_SECRET`을 강력한 랜덤 문자열로 설정
- 프로덕션 환경에서는 HMAC 기반 토큰 사용 권장

### 2. 토큰 만료
- 현재 구현은 토큰 만료 시간이 없음
- 프로덕션에서는 24-48시간 만료 시간 추가 권장

### 3. Rate Limiting
- Supabase Edge Functions는 기본적으로 rate limiting 적용
- 추가 보호가 필요한 경우 Cloudflare 등 사용

## 테스트

### 1. 로컬 테스트

```bash
# Edge Functions 로컬 실행
supabase functions serve

# 테스트 요청
curl -X POST http://localhost:54321/functions/v1/notify-admin-signup \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user-id",
    "email": "test@example.com",
    "display_name": "테스트 사용자",
    "role": "user",
    "status": "pending"
  }'
```

### 2. 프로덕션 테스트

1. 테스트 계정으로 가입
2. 이메일 인증 완료
3. 관리자 이메일 확인
4. 승인/거절 버튼 클릭
5. 결과 페이지 확인
6. 사용자 이메일 확인

## 문제 해결

### 이메일이 발송되지 않는 경우

1. **환경 변수 확인:**
   ```bash
   # Supabase CLI로 확인
   supabase secrets list
   ```

2. **Resend API 키 확인:**
   - Resend 대시보드에서 API 키 상태 확인
   - 월 발송 한도 확인

3. **Edge Function 로그 확인:**
   - Supabase Dashboard → Edge Functions → Logs

### 승인 링크가 작동하지 않는 경우

1. **토큰 검증 실패:**
   - `APPROVAL_TOKEN_SECRET` 일치 여부 확인
   - 토큰 생성/검증 로직 확인

2. **데이터베이스 권한:**
   - `ai_hub_update_member_v2` RPC 함수 존재 확인
   - Service Role Key 권한 확인

## 추가 개선 사항

### 1. 토큰 만료 시간 추가

```typescript
function generateApprovalToken(userId: string, secret: string, expiresIn: number = 48 * 60 * 60 * 1000): string {
  const expiresAt = Date.now() + expiresIn
  const data = `${userId}:${expiresAt}`
  // ... HMAC 생성
}

function verifyToken(token: string, userId: string, secret: string): boolean {
  // ... 토큰 검증
  // 만료 시간 확인
  if (expiresAt < Date.now()) {
    return false
  }
  return true
}
```

### 2. 관리자 대시보드 통합

Users 페이지에서도 승인/거절 가능하도록 UI 추가

### 3. 알림 히스토리

승인/거절 이력을 데이터베이스에 저장

### 4. 다중 관리자 지원

여러 관리자에게 동시에 알림 발송

## 참고 자료

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Resend Documentation](https://resend.com/docs)
- [Supabase Auth](https://supabase.com/docs/guides/auth)