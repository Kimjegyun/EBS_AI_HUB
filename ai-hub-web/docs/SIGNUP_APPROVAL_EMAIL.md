# 가입 승인 및 알림 메일

## 흐름

- 새 일반 사용자와 관리자 가입은 모두 `pending` 상태로 생성됩니다. 첫 관리자 가입도 자동 승인되지 않습니다.
- 가입 신청 직후 `notify-admin-signup`이 대기 멤버십을 확인하고 승인된 모든 owner/admin 계정에 알림을 보냅니다. 이메일 확인이 필요한 가입도 계정 생성 후 바로 알림을 요청합니다.
- 한 관리자가 사용자를 승인하면 가입자 안내와 함께 승인 처리 결과를 모든 관리자에게 보냅니다. 관리자 화면과 메일 승인 링크가 같은 원자적 승인 처리를 사용합니다.
- 다른 관리자가 이미 승인한 뒤 오래된 화면이나 메일 링크에서 다시 승인하면 상태를 덮어쓰지 않고 이미 승인된 사용자라고 표시합니다. 승인 완료 알림은 관리자별로 중복되지 않으며, 발송 실패한 수신자만 재시도합니다.
- `ADMIN_NOTIFICATION_EMAIL`은 첫 owner를 아직 설정하지 않은 초기 설치의 fallback입니다. 승인된 관리자 계정이 있으면 그 계정 이메일로 발송합니다.

## Supabase 설정

Supabase Edge Function secrets에 다음 값을 설정합니다.

- `ADMIN_NOTIFICATION_EMAIL`: 승인된 관리자가 아직 없는 초기 설치의 fallback 주소. 일반 운영에서는 승인된 관리자 계정의 이메일을 자동으로 사용합니다.
- `RESEND_API_KEY`: Resend 발송 키.
- `FROM_EMAIL`: Resend에서 인증한 발신 주소(예: `AI HUB <noreply@인증된-도메인>`).
- `APPROVAL_TOKEN_SECRET`: 관리자 메일의 승인/거절 링크 서명 키.

신규 마이그레이션을 적용하고 함수를 배포합니다.

```sh
supabase db push
supabase functions deploy notify-admin-signup --no-verify-jwt
supabase functions deploy notify-admin-member-approved
supabase functions deploy notify-member-approved
supabase functions deploy approve-user --no-verify-jwt
```

`notify-admin-signup`은 이메일 확인 전 호출이 필요하므로 JWT 검증을 끄지만, 서버에서 최근 생성된 계정인지와 실제 AI HUB 멤버십이 대기 상태인지 확인합니다. 승인 완료 알림 함수는 로그인한 승인 관리자 권한을 검사합니다.

## 첫 관리자

기존에 승인된 AI HUB owner/admin이 있다면 그 계정이 첫 가입 신청을 승인합니다. 빈 환경에는 기본 관리자가 자동 생성되지 않습니다. 최초 배포 시 신뢰된 운영자가 Supabase SQL Editor에서 첫 계정을 확인한 뒤 해당 계정만 owner로 부트스트랩해야 합니다. 일반 가입 요청을 자동 승인하는 방식은 사용하지 않습니다.
