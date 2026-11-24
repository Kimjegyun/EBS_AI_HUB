# AI HUB 관리자 승인 Android 앱

> 무상 구현 경로는 [Android 설치형 PWA 안내](ADMIN_APPROVAL_ANDROID_FREE_PWA.md)를 기준으로 합니다. Firebase/Play Store용 네이티브 앱 초안은 보류합니다.

## 목표

관리자가 가입 승인 메일을 기다리지 않고 휴대폰 푸시 알림을 받아 가입 요청을 검토하고 승인한다. 승인이 완료되면 기존 AI HUB 메일 흐름으로 가입자에게 환영 메일을 보내고, 모든 관리자에게 처리 결과를 알린다.

## 앱 흐름

1. 관리자가 Google 계정으로 로그인한다. Supabase Auth가 세션을 발급한다.
2. 서버가 해당 계정의 AI HUB 멤버십이 `approved` 상태이고 역할이 `owner` 또는 `admin`인지 확인한다.
3. 앱은 FCM 푸시 토큰을 인증된 Edge Function에 등록한다. 기기 토큰은 앱에서만 전송하고, 서버에서만 읽을 수 있게 저장한다.
4. 가입 요청이 접수되면 서버가 각 승인 관리자의 등록 기기에 푸시를 보낸다. 잠금 화면에는 개인 정보를 최소한으로 표시하고, 상세 정보는 앱 안에서 인증 후 읽는다.
5. 관리자가 앱에서 요청을 열고 승인 버튼을 누르면 서버의 관리자 승인 RPC가 상태를 원자적으로 갱신한다.
6. 상태가 실제로 `pending`에서 `approved`로 바뀐 경우에만 가입자 환영 메일을 보낸다. 이미 다른 관리자가 처리했다면 앱에 `이미 승인된 사용자` 상태를 표시하고 환영 메일을 중복 발송하지 않는다.
7. 승인 결과는 모든 관리자에게 이메일과 앱 알림으로 전달한다.

## 권한과 데이터 경계

- 네이티브 Android 앱은 Kotlin + Jetpack Compose로 구성한다.
- 로그인은 AI HUB가 이미 사용하는 Google OAuth / Supabase Auth를 사용한다. 관리자 공용 코드는 앱 로그인이나 API 인증에 사용하지 않는다.
- 사용자 목록은 `ai_hub_list_members_v3`, 승인은 `ai_hub_approve_member_v1`을 사용한다. 두 RPC의 관리자 검사는 서버 측에서 유지한다.
- 환영 메일은 승인 전환이 실제로 성공했을 때만 발송한다. 모바일 클라이언트가 Resend 또는 Firebase 비밀 키를 보유하지 않는다.
- FCM 토큰 등록·해제 Edge Function은 로그인한 승인 관리자만 호출할 수 있다.
- 기기 토큰 테이블은 RLS를 켜고 브라우저/사용자 역할의 직접 읽기·쓰기를 허용하지 않는다. Edge Function 서비스 역할만 토큰을 읽고 FCM으로 발송한다.
- 알림에는 이름·이메일 등 가입자 개인정보를 넣지 않고 “새 가입 승인 요청이 있습니다”와 요청 ID만 포함한다. 앱이 열리면 권한을 다시 확인한 뒤 서버에서 최신 정보를 조회한다.
- 푸시 알림 자체로 승인하지 않는다. 앱 로그인과 승인 확인을 거친 후 승인 요청을 제출한다.

## 필요한 서버 구성

1. `ai_hub.admin_push_devices` 테이블: 관리자 사용자 ID, FCM 토큰, 기기 이름, 생성·갱신 시각. 토큰은 서비스 역할에서만 접근한다.
2. `register-admin-device` Edge Function: 인증 사용자와 승인 관리자 여부를 확인한 뒤 토큰을 등록하거나 갱신한다.
3. `remove-admin-device` Edge Function: 로그아웃/기기 제거 시 현재 사용자의 기기 토큰을 비활성화한다.
4. FCM 발송 모듈: 가입 대기 메일을 보내는 `notify-admin-signup`에서 같은 관리자 기기들에 알림을 전달한다. 실패한 푸시는 재시도 가능하도록 결과를 기록한다.
5. `approve-admin-member` Edge Function 또는 인증된 RPC 연동: 관리자 권한 확인, 원자적 승인, 가입자 환영 메일, 관리자 완료 알림을 하나의 서버 흐름으로 제공한다. 메일 발송을 재시도해도 중복 메일이 생기지 않도록 이벤트 키를 기록한다.
6. Supabase Edge Function secrets: Firebase 서비스 계정 JSON과 Firebase 프로젝트 ID. 서비스 계정 키는 Android 패키지에 넣지 않는다.

## Android 화면 범위 (MVP)

- Google 로그인 및 관리자 권한 확인
- 승인 대기 목록: 이름, 이메일, 조직, 신청 시각, 이메일 확인 여부
- 요청 상세와 승인/거절 확인
- 승인 처리 중, 완료, 이미 처리됨, 네트워크 오류 상태
- 가입자 환영 메일 전송 결과와 재시도 상태
- 앱 알림 설정 및 기기 등록 해제

## 운영 설정 필요 사항

- Firebase 프로젝트에서 Android 앱 등록, 패키지 ID와 서명 SHA 지문 연결, `google-services.json` 추가
- Firebase Cloud Messaging API 활성화 및 서버 전용 서비스 계정 권한 설정
- Google OAuth 공급자에 Android 앱의 redirect/클라이언트 설정 추가
- Supabase Edge Function secrets 등록 및 신규 마이그레이션·함수 배포
- Android SDK와 Android Studio 또는 JDK/Gradle 설치 후 debug APK 빌드 및 실제 기기 푸시 확인

## 현재 저장소 상태

- 관리자 전원에게 가입 대기/승인 완료 메일을 보내는 Edge Function과 승인 전용 RPC가 이미 있다.
- 웹 관리자 흐름은 승인 상태가 실제로 바뀌었을 때 가입자 승인 메일을 보낸다.
- Android 네이티브 앱, FCM 토큰 저장, 푸시 전달은 아직 없다.
- 현재 개발 PC에는 Java, Gradle, Android SDK가 없어 Android APK를 로컬에서 빌드할 수 없다.
