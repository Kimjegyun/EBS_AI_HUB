# 사용자 관리 (관리자)

관리자 메뉴 **사용자 관리**(`src/pages/UsersPage.tsx`)에서 가입 요청을 승인하거나 거절하고, AI 월 턴 한도를 정하고, 사용자 정보를 수정합니다.

## 사용자 정보 수정

각 사용자 행의 **수정** 버튼을 누르면 편집 창(`src/components/MemberEditDialog.tsx`)이 열립니다. 바꾼 뒤 **저장**합니다.

| 항목 | 저장 위치 (Supabase) |
|---|---|
| 이름(표시 이름) | `core.profiles.display_name`, 계정 메타데이터 `display_name` |
| 성명 | 계정 메타데이터 `real_name` (30자). 표시 이름이 영문 약자일 때 실제 성명을 둡니다. 목록의 Organization 칸 맨 위에 굵게 표시됩니다 |
| 소속(본부) | 계정 메타데이터 `headquarters`. 관리자 프로필이 있으면 `ai_hub.admin_profiles.organization`에도 저장 |
| 부서, 연락처 | 계정 메타데이터 `department`, `contact_phone` |
| 역할, 상태 | `core.project_memberships.role`, `status` |

- DB 함수는 `public.ai_hub_update_member_profile_v2`입니다. v1에 성명을 더했고, 권한과 보호 규칙은 v1을 그대로 거칩니다(`supabase/migrations/20261008090000_admin_edit_member_profile.sql`, `20261008120000_member_real_name.sql`). 승인된 관리자만 실행할 수 있습니다.
- 표시 이름에 한글이 없고 12자 이하(예: `kjg`)이면서 성명이 비어 있는 사용자는 Organization 칸에 **성명 미입력** 표시가 붙습니다. 누르면 바로 수정 창이 열립니다.
- 본인 계정의 역할과 상태는 바꿀 수 없습니다. 실수로 관리자 권한을 잃는 것을 막기 위해서입니다.
- 소유자(owner) 역할은 소유자만 주거나 뺄 수 있습니다.
- 이름은 비울 수 없습니다. 각 항목은 60자까지, 연락처는 30자까지 저장됩니다.

## AI 턴 그룹

- **그룹 만들기:** 아래쪽 **그룹별 턴 할당**에서 그룹 이름과 월 턴을 정합니다.
- **그룹 지정:** **Member List**의 **Group** 칸(Role 옆)에서 사용자를 그룹에 넣거나 **그룹 없음 (개별 한도)**로 되돌립니다. 관리자 계정은 턴 제한이 없어 '—'로 표시됩니다.
- **적용 규칙:**
  - 그룹에 지정된 사용자는 **그룹의 월 턴**이 실제 한도로 적용됩니다. AI를 사용할 때 `ai_hub_consume_api_usage_v1`이 검사합니다.
  - 개별 한도는 지워지지 않고 남아 있어서, 그룹을 해제하면 다시 쓰입니다.
- 그룹을 삭제하면 소속 사용자는 자동으로 개별 한도로 돌아갑니다.
- 그룹은 서버(`ai_hub.api_usage_groups`)에 저장되어 어느 관리자 화면에서나 같습니다.
  - 예전 버전은 그룹을 관리자 브라우저에만 저장해서 실제로는 적용되지 않았습니다.
  - 그때 만든 그룹은 처음 열 때 서버로 자동으로 옮겨집니다.
- 마이그레이션: `supabase/migrations/20261008130000_ai_usage_groups.sql`

## 사용자 삭제

**수정** 옆의 **삭제** 버튼을 누르고, 확인 창에 그 사용자의 이메일을 정확히 입력하면 삭제됩니다.

- DB 함수: `public.ai_hub_delete_member_v1` (`supabase/migrations/20261008110000_admin_delete_member.sql`)
- **삭제 범위:**
  - AI 허브 멤버십과 관리자 프로필을 지웁니다.
  - 다른 프로젝트(`core.project_memberships`)에 속하지 않은 사용자는 로그인 계정(`auth.users` → `core.profiles` 연쇄 삭제)도 지웁니다. 이 경우 같은 이메일로 다시 가입할 수 있습니다.
  - 다른 프로젝트에 속한 사용자는 로그인 계정을 남깁니다.
- 재물조사 결과처럼 이미 등록된 업무 기록은 남습니다.
- 본인 계정은 삭제할 수 없고, 소유자 계정은 소유자만 삭제할 수 있습니다. 해당하지 않는 경우에는 삭제 버튼이 보이지 않습니다.

## 비밀번호 초기화 (관리자)

**수정** 옆의 **비밀번호 초기화**(자물쇠) 버튼을 누르면 창(`src/components/MemberPasswordResetDialog.tsx`)이 열립니다. 두 가지 방법 중 하나를 고릅니다.

1. **임시 비밀번호 발급:** 메일을 받기 어려운 사용자에게 씁니다.
   - 12자 임시 비밀번호가 자동으로 만들어집니다. 새로 만들거나 직접 고칠 수 있습니다(6~72자).
   - **임시 비밀번호로 초기화**를 누르면 바로 적용되고, 그 사용자가 로그인해 있던 기기는 모두 로그아웃됩니다.
   - 적용한 뒤 보이는 비밀번호를 복사해 사용자에게 직접 전달합니다. 창을 닫으면 다시 볼 수 없습니다.
   - 사용자가 임시 비밀번호로 로그인하면 허브에 들어가기 전에 **새 비밀번호를 정하는 화면**이 먼저 열립니다. 새 비밀번호를 정하기 전에는 허브를 쓸 수 없습니다.
2. **재설정 메일 보내기:** 사용자의 이메일로 재설정 링크를 보냅니다. 지금 비밀번호는 바뀌지 않고, 사용자가 링크를 눌러 직접 새 비밀번호를 정합니다.

- DB 함수: `public.ai_hub_admin_reset_member_password_v1` (`supabase/migrations/20261014090000_admin_reset_member_password.sql`)
  - 비밀번호를 Supabase 로그인과 같은 방식(bcrypt)으로 저장하고, 계정 메타데이터에 `password_reset_required: true`를 표시합니다.
  - 사용자가 새 비밀번호를 정하면 이 표시가 지워집니다.
- 본인 계정은 여기서 초기화할 수 없습니다. 상단 열쇠 아이콘이나 비밀번호 찾기를 씁니다. 소유자 계정은 소유자만 초기화할 수 있습니다.

## 비밀번호 찾기 (사용자)

로그인 화면의 비밀번호 칸 옆 **비밀번호 찾기**를 누릅니다.

1. **아이디**와 **가입한 이메일**을 입력하고 **재설정 메일 받기**를 누릅니다. 둘이 같은 계정일 때만 메일이 갑니다.
2. 메일의 링크를 누르면 **비밀번호 재설정** 화면(`/reset-password`, `src/pages/ResetPasswordPage.tsx`)이 열립니다.
3. 새 비밀번호를 두 번 입력하고 **비밀번호 변경**을 누릅니다. 로그인 화면으로 돌아가면 새 비밀번호로 로그인합니다.

- 링크가 만료되었거나 이미 썼다면 화면에 안내가 나옵니다. 비밀번호 찾기에서 다시 요청합니다.
- 링크를 눌러도 새 비밀번호를 정하기 전에는 허브에 자동으로 로그인되지 않습니다.
- Supabase 설정 없이 로컬 계정으로만 쓰는 환경에서는 메일을 보낼 수 없습니다. 관리자에게 초기화를 요청합니다.

## 로그인 아이디·비밀번호 설정 (Google 가입자 포함)

로그인한 뒤 상단의 **열쇠 아이콘**(`src/components/AccountLoginDialog.tsx`)에서 본인의 로그인 아이디와 비밀번호를 정하거나 바꿉니다.

- Google로 가입한 계정에는 아이디와 비밀번호가 없습니다. 여기서 둘을 정해 두면 로그인 화면에서 **아이디와 비밀번호로도** 로그인할 수 있습니다. Google 로그인도 그대로 쓸 수 있습니다.
- 아이디 규칙은 회원가입과 같습니다. 영문 소문자, 숫자, 점, 밑줄, 하이픈 3~32자이며, 다른 계정이 쓰는 아이디는 쓸 수 없습니다.
- 비밀번호를 바꾸지 않으려면 비밀번호 칸을 비워 둡니다.
- Supabase의 **Secure password change**가 켜져 있으면, 저장할 때 가입 이메일로 확인 코드가 갑니다. 코드를 입력한 뒤 다시 저장합니다.
- DB 함수: `public.ai_hub_set_my_login_id_v1` (`supabase/migrations/20261014100000_set_my_login_id.sql`). 비밀번호는 Supabase `auth.updateUser`로 저장합니다.

### Supabase 대시보드 설정 (1회)

- **Authentication → URL Configuration → Redirect URLs**에 포털별 재설정 주소를 추가합니다.
  - 예: `https://localhost:5173/reset-password`, `https://localhost:5174/reset-password`, 외부 포털 주소의 `/reset-password`
  - 와일드카드 예: `https://*.example.com/**`
  - 등록하지 않으면 링크가 Site URL로 돌아가서 재설정 화면이 열리지 않습니다.
- Supabase 기본 메일 서버는 시간당 보낼 수 있는 메일 수가 적습니다. 한도를 넘으면 "메일 발송 한도를 넘었습니다"라는 안내가 나옵니다. 사용자가 많으면 **Authentication → SMTP Settings**에서 회사 메일 서버를 연결합니다.

## 이메일·아이디 가입자 승인 목록 표시

Supabase는 이메일 인증을 요구합니다. 그래서 이메일·아이디로 가입하면 인증 링크를 누르기 전까지 로그인 세션이 없습니다.

- **예전:** 승인 대기 정보(멤버십)는 인증 후 **첫 로그인 때** 만들어졌습니다. 그 전에는 관리자 목록에 보이지 않았습니다. Google 가입은 해당되지 않았습니다.
- **지금:** `auth.users`에 계정이 생기는 순간 DB 트리거(`ai_hub_signup_membership`)가 **승인 대기(pending)** 멤버십을 만듭니다. 그래서 가입 직후 바로 목록에 보입니다.
  - 대상은 가입 양식으로 만든 계정(`user_metadata.login_id` 있음)뿐입니다.
  - 트리거는 소유자 지정이나 승인을 하지 않습니다. 그 판단은 기존 첫 로그인 규칙과 관리자 승인을 따릅니다.
  - 트리거에서 오류가 나도 가입 자체는 실패하지 않습니다.
- 마이그레이션을 실행할 때, 이전에 가입했지만 멤버십이 없던 계정도 함께 채워 넣습니다.
- 목록에서 인증 링크를 아직 누르지 않은 가입자에게는 **이메일 미인증** 표시가 붙습니다. 승인해도 메일 인증 전에는 로그인할 수 없습니다.

## 최초 설치 (1회)

Supabase SQL Editor에서 마이그레이션 파일을 차례로 실행합니다.

1. https://supabase.com/dashboard/project/tpdjptjcqyinapcqfjji/sql/new 를 엽니다.
2. 아래 파일 내용을 붙여 넣고 **Run**을 누릅니다.
   - `supabase/migrations/20261008090000_admin_edit_member_profile.sql` (사용자 정보 수정)
   - `supabase/migrations/20261008100000_signup_membership_on_create.sql` (가입 즉시 승인 목록 표시)
   - `supabase/migrations/20261008110000_admin_delete_member.sql` (사용자 삭제)
   - `supabase/migrations/20261008120000_member_real_name.sql` (성명)
   - `supabase/migrations/20261008130000_ai_usage_groups.sql` (AI 턴 그룹)
   - `supabase/migrations/20261014090000_admin_reset_member_password.sql` (관리자 비밀번호 초기화)
   - `supabase/migrations/20261014100000_set_my_login_id.sql` (본인 아이디 설정, Google 가입자의 아이디 로그인)

설치 전에 저장하면 "사용자 정보 수정 기능이 Supabase에 아직 설치되지 않았습니다"라는 안내가 나옵니다.
