-- No account may grant itself an approved admin/owner membership during signup.
-- The first owner must be bootstrapped explicitly by an operator in SQL.
create or replace function public.ai_hub_ensure_membership_v2(
  p_display_name text,
  p_organization text default null,
  p_requested_role text default 'user'
)
returns jsonb
language plpgsql
security definer
set search_path = public, core, ai_hub
as $$
declare
  v_current_user uuid := auth.uid();
  v_auth_email text;
  v_ai_hub_project uuid;
  v_profile_name text := nullif(trim(coalesce(p_display_name, '')), '');
  v_requested_role text := case when p_requested_role = 'admin' then 'admin' else 'user' end;
  v_next_role text;
begin
  if v_current_user is null then
    raise exception 'Authentication is required.';
  end if;

  select core.ai_hub_project_id() into v_ai_hub_project;
  if v_ai_hub_project is null then
    raise exception 'AI HUB project is not configured.';
  end if;

  select u.email into v_auth_email from auth.users u where u.id = v_current_user;
  v_profile_name := coalesce(v_profile_name, split_part(coalesce(v_auth_email, ''), '@', 1), 'User');
  v_next_role := case when v_requested_role = 'admin' then 'admin' else 'user' end;

  insert into core.profiles(user_id, email, display_name, updated_at)
  values(v_current_user, coalesce(v_auth_email, ''), v_profile_name, now())
  on conflict(user_id) do update set email = excluded.email,
    display_name = excluded.display_name, updated_at = now();

  insert into core.project_memberships(project_id, user_id, role, status)
  values(v_ai_hub_project, v_current_user, v_next_role, 'pending')
  on conflict on constraint project_memberships_pkey do update
    set role = case when core.project_memberships.status = 'approved'
      then core.project_memberships.role else excluded.role end,
        status = case when core.project_memberships.status = 'approved'
      then core.project_memberships.status else 'pending' end;

  if v_requested_role = 'admin' then
    insert into ai_hub.admin_profiles(user_id, organization, updated_at)
    values(v_current_user, coalesce(nullif(trim(p_organization), ''), 'Unspecified'), now())
    on conflict(user_id) do update set organization = excluded.organization, updated_at = now();
  end if;

  return public.ai_hub_get_session_v2();
end
$$;

revoke all on function public.ai_hub_ensure_membership_v2(text, text, text) from public, anon;
grant execute on function public.ai_hub_ensure_membership_v2(text, text, text) to authenticated;

notify pgrst, 'reload schema';

create table if not exists ai_hub.signup_notification_log (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table ai_hub.signup_notification_log enable row level security;
