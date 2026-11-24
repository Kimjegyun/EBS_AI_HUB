# AI HUB 관리자 Android 앱: 무상 PWA 방식

## 선택한 방식

Android 전용 APK 대신 기존 AI HUB 관리자 포털을 홈 화면에 설치 가능한 PWA로 제공한다. Chrome Android에서 전체 화면 앱처럼 실행하고, 브라우저 표준 Web Push로 가입 알림을 받는다. 이 방식은 Firebase 프로젝트와 Play Store 등록을 새로 만들지 않아도 되고, 별도 푸시 발송 서비스 비용도 없다. 기존 관리자 로그인과 가입 승인 화면을 그대로 사용한다.

Web Push는 서비스 워커와 Push API를 사용하며, 발송 서버는 VAPID 공개/개인 키로 서명한다. 앱은 로그인된 관리자의 구독을 Supabase에 등록하고, Edge Function이 새 가입 이벤트 때 관리자 전원의 구독 기기로 알림을 보낸다.

## 관리자 흐름

1. 관리자가 Android Chrome에서 `https://ebs-aihub.com/admin/`에 로그인한다.
2. 사용자 관리 화면에서 `알림 켜기`를 누르고 브라우저 알림 권한을 허용한다.
3. Chrome 메뉴에서 `앱 설치` 또는 `홈 화면에 추가`를 선택한다.
4. 가입 신청 시 기존 관리자 이메일과 함께 “새 가입 신청이 도착했습니다” 푸시를 받는다. 잠금 화면에는 가입자 이름·이메일을 표시하지 않는다.
5. 알림을 누르면 관리자 앱의 가입자 관리 화면이 열리고, 로그인된 승인 관리자가 신청 정보를 확인해 승인한다.
6. 기존 승인 RPC가 첫 승인만 처리한다. 승인 전환이 성공하면 기존 메일 흐름이 가입자에게 환영 메일을 보내고, 관리자들에게 처리 결과를 알린다. 다른 관리자가 먼저 승인했으면 이미 승인된 상태를 표시하고 환영 메일을 반복 발송하지 않는다.

## 보안 경계

- 관리자 Google 로그인과 AI HUB 승인 역할 검사를 그대로 사용한다.
- 관리자 공용 코드, Resend 키, VAPID 개인 키를 브라우저 번들에 넣지 않는다.
- 브라우저에는 VAPID 공개 키만 제공한다. 개인 키와 연락처 값은 Supabase Edge Function secrets에만 보관한다.
- 푸시 구독 endpoint는 발송 권한과 같은 capability URL이므로 테이블 RLS를 활성화하고 사용자에게 직접 읽기/쓰기 권한을 주지 않는다. 관리자 확인 Edge Function만 기기 등록을 허용하고, 서비스 역할 Edge Function만 전송한다.
- 푸시 내용은 일반적인 가입 알림만 포함한다. 개인정보와 승인 동작은 푸시에 넣지 않는다. 사용자는 앱을 열고 인증된 상태에서 승인한다.
- 로그아웃할 때 현재 브라우저 구독을 제거한다. 만료 endpoint는 발송 시 정리한다.

## 저장소 구현

- `public/sw.js`: 백그라운드 push 알림 표시와 알림 클릭 시 관리자 가입 관리 화면 열기
- `src/components/AdminWebPushSettings.tsx`: 기기 알림 켜기/끄기
- `supabase/functions/register-admin-web-push`: 인증된 승인 관리자 기기 등록
- `supabase/functions/remove-admin-web-push`: 로그아웃한 기기 등록 해제
- `supabase/functions/_shared/adminWebPush.ts`: VAPID 서명, 관리자 구독 조회, 알림 발송과 만료 구독 정리
- `supabase/functions/notify-admin-signup`: 기존 관리자 가입 안내 메일과 함께 가입 푸시 발송
- `supabase/migrations/20261120140000_admin_web_push_subscriptions.sql`: 서비스 역할만 접근 가능한 구독·중복 방지 테이블

## 무상 활성화 절차

1. `npx --yes web-push@3.6.7 generate-vapid-keys`로 VAPID 키 쌍을 생성한다. 개인 키는 채팅, Git, Android/PWA 번들에 넣지 않는다.
2. Supabase Edge Function secrets에 `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_CONTACT`를 설정한다. `WEB_PUSH_CONTACT`는 `mailto:관리자 연락 이메일` 형식이다.
3. 공개 키 `WEB_PUSH_PUBLIC_KEY`만 `server/.env`에 설정해 관리자 PWA를 빌드한다.
4. 마이그레이션을 운영 Supabase에 적용하고 `register-admin-web-push`, `remove-admin-web-push`, 변경된 `notify-admin-signup` Edge Function을 배포한다.
5. 관리자 포털 배포 후 Android Chrome에서 설치, 알림 권한, 새 가입 푸시, 앱 내 승인, 환영 메일을 확인한다.

새 Firebase/FCM 프로젝트와 Google Play 개발자 계정은 사용하지 않는다. 기존 Supabase와 Resend의 현재 사용량 한도 안에서 동작하며, 푸시 수신에는 네트워크와 Chrome의 알림 권한이 필요하다.

## 현재 환경 제약

현재 개발 PC에는 Java, Gradle, Android SDK가 없다. 기존 관리자 웹 앱을 Android PWA로 설치해 쓰므로 별도 APK 빌드는 필요하지 않다. 운영 푸시를 활성화하려면 VAPID 키를 Supabase secrets에 직접 설정하고 신규 마이그레이션·함수를 배포해야 한다.
