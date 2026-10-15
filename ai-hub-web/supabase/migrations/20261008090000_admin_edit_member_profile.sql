-- Admin edit of a member's profile and access in one call.
--
-- Member details live in three places, all of which the member list reads
-- (ai_hub_list_members_v3):
--   core.profiles.display_name                         이름
--   auth.users.raw_user_meta_data: headquarters,
--     department, contact_phone, display_name          소속(본부)·부서·연락처
--   ai_hub.admin_profiles.organization                 관리자 소속 (when present)
--   core.project_memberships: role, status             역할·상태
-- Clients cannot write another user's auth metadata, so this is a security
-- definer function gated by core.is_ai_hub_admin().
create or replace function public.ai_hub_update_member_profile_v1(
  p_user_id uuid,
  p_display_name text,
  p_organization text,
  p_department text,
  p_contact_phone text,
  p_role text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, core, ai_hub
as $$
declare
  v_project uuid := core.ai_hub_project_id();
  v_name text := left(btrim(coalesce(p_display_name, '')), 60);
  v_org text := left(btrim(coalesce(p_organization, '')), 60);
  v_dept text := left(btrim(coalesce(p_department, '')), 60);
  v_phone text := left(btrim(coalesce(p_contact_phone, '')), 30);
  v_role text := case when p_role in ('owner', 'admin', 'user') then p_role else 'user' end;
  v_status text := case when p_status in ('pending', 'approved', 'rejected') then p_status else 'pending' end;
  v_current core.project_memberships%rowtype;
  v_email text;
begin
  if not core.is_ai_hub_admin() then
    raise exception 'AI HUB admin permission is required.';
  end if;
  if v_name = '' then
    raise exception '이름을 입력해 주세요.';
  end if;

  select * into v_current from core.project_memberships
   where project_id = v_project and user_id = p_user_id;
  if not found then
    raise exception 'AI HUB 회원이 아닙니다.';
  end if;
  -- An admin changing their own role or status could lock everyone out.
  if p_user_id = auth.uid() and (v_role <> v_current.role or v_status <> v_current.status) then
    raise exception '본인 계정의 역할과 상태는 변경할 수 없습니다.';
  end if;
  -- Only an owner may grant or remove the owner role.
  if (v_role = 'owner' or v_current.role = 'owner') and v_role <> v_current.role
     and not exists (select 1 from core.project_memberships
                      where project_id = v_project and user_id = auth.uid() and role = 'owner' and status = 'approved') then
    raise exception '소유자 역할은 소유자만 변경할 수 있습니다.';
  end if;

  select email into v_email from auth.users where id = p_user_id;

  insert into core.profiles (user_id, email, display_name, updated_at)
  values (p_user_id, coalesce(v_email, ''), v_name, now())
  on conflict (user_id) do update
    set display_name = excluded.display_name, updated_at = now();

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
           'display_name', v_name,
           'headquarters', v_org,
           'department', v_dept,
           'contact_phone', v_phone)
   where id = p_user_id;

  update ai_hub.admin_profiles
     set organization = v_org, updated_at = now()
   where user_id = p_user_id and v_org <> '';

  update core.project_memberships
     set role = v_role,
         status = v_status,
         approved_at = case when v_status = 'approved' then coalesce(approved_at, now()) else null end,
         approved_by = case when v_status = 'approved' then coalesce(approved_by, auth.uid()) else null end
   where project_id = v_project and user_id = p_user_id;
end
$$;

revoke all on function public.ai_hub_update_member_profile_v1(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.ai_hub_update_member_profile_v1(uuid, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
