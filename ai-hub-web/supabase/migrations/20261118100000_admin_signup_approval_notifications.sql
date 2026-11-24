-- Idempotent per-recipient delivery tracking for signup and approval notices.
create table if not exists ai_hub.admin_email_notification_log (
  event_key text not null,
  recipient_email text not null,
  sent_at timestamptz not null default now(),
  primary key (event_key, recipient_email)
);
alter table ai_hub.admin_email_notification_log enable row level security;

create or replace function public.ai_hub_approve_member_v1(
  p_user_id uuid,
  p_role text default 'user'
)
returns jsonb
language plpgsql
security definer
set search_path = public, core, ai_hub
as $$
declare
  v_project uuid := core.ai_hub_project_id();
  v_role text := case when p_role in ('owner', 'admin', 'user') then p_role else 'user' end;
  v_member core.project_memberships%rowtype;
  v_changed boolean := false;
begin
  if not core.is_ai_hub_admin() then
    raise exception 'AI HUB admin permission is required.';
  end if;
  if v_project is null then
    raise exception 'AI HUB project is not configured.';
  end if;
  if v_role = 'owner' and not exists (
    select 1 from core.project_memberships
     where project_id = v_project and user_id = auth.uid() and status = 'approved' and role = 'owner'
  ) then
    raise exception 'Only an owner may grant the owner role.';
  end if;
  if v_role = 'owner' and not exists (
    select 1 from core.project_memberships
     where project_id = v_project and user_id = auth.uid() and status = 'approved' and role = 'owner'
  ) then
    raise exception 'Only an owner may grant the owner role.';
  end if;

  update core.project_memberships
     set status = 'approved', role = v_role, approved_at = now(), approved_by = auth.uid()
   where project_id = v_project and user_id = p_user_id and status = 'pending'
   returning * into v_member;
  v_changed := found;

  if not v_changed then
    select * into v_member from core.project_memberships
     where project_id = v_project and user_id = p_user_id;
    if not found then raise exception 'AI HUB member was not found.'; end if;
  end if;

  return jsonb_build_object(
    'status', v_member.status,
    'role', v_member.role,
    'approved_at', v_member.approved_at,
    'approved_by', v_member.approved_by,
    'changed', v_changed
  );
end
$$;

revoke all on function public.ai_hub_approve_member_v1(uuid, text) from public, anon;
grant execute on function public.ai_hub_approve_member_v1(uuid, text) to authenticated;

-- Profile editing can also change a pending/rejected member to approved. Lock the
-- membership row and perform that transition through the same atomic approval RPC.
create or replace function public.ai_hub_update_member_profile_v3(
  p_user_id uuid,
  p_display_name text,
  p_real_name text,
  p_organization text,
  p_department text,
  p_contact_phone text,
  p_role text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, core, ai_hub
as $$
declare
  v_project uuid := core.ai_hub_project_id();
  v_current core.project_memberships%rowtype;
  v_approval jsonb := null;
  v_requested_status text := case when p_status in ('pending', 'approved', 'rejected') then p_status else 'pending' end;
begin
  if not core.is_ai_hub_admin() then raise exception 'AI HUB admin permission is required.'; end if;
  select * into v_current from core.project_memberships
   where project_id = v_project and user_id = p_user_id for update;
  if not found then raise exception 'AI HUB member was not found.'; end if;

  if v_requested_status = 'approved' then
    perform public.ai_hub_update_member_profile_v2(
      p_user_id, p_display_name, p_real_name, p_organization, p_department, p_contact_phone,
      p_role, case when v_current.status = 'approved' then 'approved' else 'pending' end);
    if v_current.status = 'approved' then
      update core.project_memberships set approved_at = v_current.approved_at, approved_by = v_current.approved_by
       where project_id = v_project and user_id = p_user_id;
    end if;
    v_approval := public.ai_hub_approve_member_v1(p_user_id, p_role);
    return v_approval || jsonb_build_object('profile_saved', true);
  end if;

  perform public.ai_hub_update_member_profile_v2(
    p_user_id, p_display_name, p_real_name, p_organization, p_department, p_contact_phone, p_role, v_requested_status);
  return jsonb_build_object('status', v_requested_status, 'changed', v_current.status <> v_requested_status, 'profile_saved', true);
end
$$;

revoke all on function public.ai_hub_update_member_profile_v3(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.ai_hub_update_member_profile_v3(uuid, text, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
