create or replace function public.ai_hub_get_session_v2()
returns jsonb
language sql
stable
security definer
set search_path = public, core, ai_hub
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'user_id', au.id,
        'project_id', cp.id,
        'email', coalesce(cpr.email, au.email),
        'display_name', coalesce(cpr.display_name, split_part(coalesce(au.email, ''), '@', 1), 'User'),
        'organization', ahap.organization,
        'role', cpm.role,
        'status', cpm.status
      )
      from auth.users as au
      join core.projects as cp
        on cp.slug = 'ai_hub'
      join core.project_memberships as cpm
        on cpm.project_id = cp.id
       and cpm.user_id = au.id
      left join core.profiles as cpr
        on cpr.user_id = au.id
      left join ai_hub.admin_profiles as ahap
        on ahap.user_id = au.id
      where au.id = auth.uid()
      limit 1
    ),
    'null'::jsonb
  )
$$;

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
  v_next_status text;
  v_has_admin boolean;
begin
  if v_current_user is null then
    raise exception 'Authentication is required.';
  end if;

  select cp.id
  into v_ai_hub_project
  from core.projects as cp
  where cp.slug = 'ai_hub'
  limit 1;

  if v_ai_hub_project is null then
    insert into core.projects (slug, name)
    values ('ai_hub', 'AI HUB')
    returning id into v_ai_hub_project;
  end if;

  select au.email
  into v_auth_email
  from auth.users as au
  where au.id = v_current_user;

  v_profile_name := coalesce(v_profile_name, split_part(coalesce(v_auth_email, ''), '@', 1), 'User');

  select exists (
    select 1
    from core.project_memberships as cpm
    where cpm.project_id = v_ai_hub_project
      and cpm.status = 'approved'
      and cpm.role in ('owner', 'admin')
  )
  into v_has_admin;

  if v_requested_role = 'admin' and not v_has_admin then
    v_next_role := 'owner';
    v_next_status := 'approved';
  elsif v_requested_role = 'admin' then
    v_next_role := 'admin';
    v_next_status := 'pending';
  else
    v_next_role := 'user';
    v_next_status := 'pending';
  end if;

  update core.profiles as cpr
  set
    email = coalesce(v_auth_email, ''),
    display_name = v_profile_name,
    updated_at = now()
  where cpr.user_id = v_current_user;

  if not found then
    insert into core.profiles (user_id, email, display_name, updated_at)
    values (v_current_user, coalesce(v_auth_email, ''), v_profile_name, now());
  end if;

  insert into core.project_memberships (
    project_id,
    user_id,
    role,
    status,
    approved_at,
    approved_by
  )
  values (
    v_ai_hub_project,
    v_current_user,
    v_next_role,
    v_next_status,
    case when v_next_status = 'approved' then now() else null end,
    case when v_next_status = 'approved' then v_current_user else null end
  )
  on conflict on constraint project_memberships_pkey do update
  set
    role = case
      when core.project_memberships.status = 'approved' then core.project_memberships.role
      else excluded.role
    end,
    status = case
      when core.project_memberships.status = 'approved' then core.project_memberships.status
      else excluded.status
    end;

  if v_requested_role = 'admin' then
    update ai_hub.admin_profiles as ahap
    set
      organization = coalesce(nullif(trim(p_organization), ''), 'Unspecified'),
      updated_at = now()
    where ahap.user_id = v_current_user;

    if not found then
      insert into ai_hub.admin_profiles (user_id, organization, updated_at)
      values (v_current_user, coalesce(nullif(trim(p_organization), ''), 'Unspecified'), now());
    end if;
  end if;

  return public.ai_hub_get_session_v2();
end
$$;

create or replace function public.ai_hub_list_members_v2()
returns jsonb
language sql
stable
security definer
set search_path = public, core, ai_hub
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', rows.user_id,
        'project_id', rows.project_uuid,
        'email', rows.member_email,
        'display_name', rows.member_name,
        'organization', rows.member_organization,
        'role', rows.member_role,
        'status', rows.member_status,
        'created_at', rows.created_timestamp,
        'approved_at', rows.approved_timestamp
      )
      order by rows.sort_status, rows.created_timestamp desc
    ),
    '[]'::jsonb
  )
  from (
    select
      au.id as user_id,
      cp.id as project_uuid,
      coalesce(cpr.email, au.email) as member_email,
      coalesce(cpr.display_name, split_part(coalesce(au.email, ''), '@', 1), 'User') as member_name,
      ahap.organization as member_organization,
      cpm.role as member_role,
      cpm.status as member_status,
      cpm.created_at as created_timestamp,
      cpm.approved_at as approved_timestamp,
      case cpm.status when 'pending' then 0 when 'approved' then 1 else 2 end as sort_status
    from core.project_memberships as cpm
    join core.projects as cp
      on cp.id = cpm.project_id
     and cp.slug = 'ai_hub'
    join auth.users as au
      on au.id = cpm.user_id
    left join core.profiles as cpr
      on cpr.user_id = au.id
    left join ai_hub.admin_profiles as ahap
      on ahap.user_id = au.id
    where core.is_ai_hub_admin()
    limit 200
  ) as rows
$$;

create or replace function public.ai_hub_update_member_v2(
  p_user_id uuid,
  p_status text,
  p_role text default 'user'
)
returns void
language plpgsql
security definer
set search_path = public, core, ai_hub
as $$
declare
  v_ai_hub_project uuid;
  v_next_status text := case when p_status in ('pending', 'approved', 'rejected') then p_status else 'pending' end;
  v_next_role text := case when p_role in ('owner', 'admin', 'user') then p_role else 'user' end;
begin
  if not core.is_ai_hub_admin() then
    raise exception 'AI HUB admin permission is required.';
  end if;

  select cp.id
  into v_ai_hub_project
  from core.projects as cp
  where cp.slug = 'ai_hub'
  limit 1;

  update core.project_memberships as cpm
  set
    status = v_next_status,
    role = v_next_role,
    approved_at = case when v_next_status = 'approved' then now() else null end,
    approved_by = case when v_next_status = 'approved' then auth.uid() else null end
  where cpm.project_id = v_ai_hub_project
    and cpm.user_id = p_user_id;
end
$$;

grant execute on function public.ai_hub_get_session_v2() to authenticated;
grant execute on function public.ai_hub_ensure_membership_v2(text, text, text) to authenticated;
grant execute on function public.ai_hub_list_members_v2() to authenticated;
grant execute on function public.ai_hub_update_member_v2(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
