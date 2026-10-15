-- Admin resets a member's password to a temporary one.
--
-- The new password is stored the way Supabase Auth stores it (bcrypt via
-- pgcrypto), so the user can sign in with it right away. The account is marked
-- with user_metadata.password_reset_required = true; the app then sends the user
-- to the change-password screen before anything else, and clears the mark when
-- they choose their own password. Existing sign-ins of that user are ended.
create or replace function public.ai_hub_admin_reset_member_password_v1(p_user_id uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, core, ai_hub, extensions
as $$
declare
  v_project uuid := core.ai_hub_project_id();
  v_target core.project_memberships%rowtype;
begin
  if not core.is_ai_hub_admin() then
    raise exception 'AI HUB admin permission is required.';
  end if;
  if p_user_id = auth.uid() then
    raise exception '본인 비밀번호는 설정 화면이나 비밀번호 찾기로 변경해 주세요.';
  end if;
  if p_new_password is null or length(p_new_password) < 6 or length(p_new_password) > 72 then
    raise exception '임시 비밀번호는 6~72자로 입력해 주세요.';
  end if;

  select * into v_target from core.project_memberships
   where project_id = v_project and user_id = p_user_id;
  if not found then
    raise exception 'AI HUB 회원이 아닙니다.';
  end if;
  if v_target.role = 'owner' and not exists (
       select 1 from core.project_memberships
        where project_id = v_project and user_id = auth.uid() and role = 'owner' and status = 'approved') then
    raise exception '소유자 계정의 비밀번호는 소유자만 초기화할 수 있습니다.';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('password_reset_required', true),
         updated_at = now()
   where id = p_user_id;
  if not found then
    raise exception '로그인 계정을 찾을 수 없습니다.';
  end if;

  -- End the user's other sign-ins so the old password's sessions cannot continue.
  delete from auth.sessions where user_id = p_user_id;
end
$$;

revoke all on function public.ai_hub_admin_reset_member_password_v1(uuid, text) from public, anon;
grant execute on function public.ai_hub_admin_reset_member_password_v1(uuid, text) to authenticated;

notify pgrst, 'reload schema';
