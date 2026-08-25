drop function if exists public.ensure_ai_hub_membership(text, text, text);
drop function if exists public.get_ai_hub_session();
drop function if exists public.list_ai_hub_members();

drop type if exists public.ai_hub_session_result cascade;
drop type if exists public.ai_hub_member_result cascade;

create or replace function public.get_ai_hub_session()
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
      from auth.users au
      join core.projects cp
        on cp.slug = 'ai_hub'
      join core.project_memberships cpm
        on cpm.project_id = cp.id
       and cpm.user_id = au.id
      left join core.profiles cpr
        on cpr.user_id = au.id
      left join ai_hub.admin_profiles ahap
        on ahap.user_id = au.id
      where au.id = auth.uid()
      limit 1
    ),
    'null'::jsonb
  )
$$;

create or replace function public.ensure_ai_hub_membership(
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
  v_user_id uuid := auth.uid();
  v_auth_email text;
  v_project_uuid uuid;
  v_profile_name text := nullif(trim(coalesce(p_display_name, '')), '');
  v_requested_role text := case when p_requested_role = 'admin' then 'admin' else 'user' end;
  v_member_role text;
  v_member_status text;
  v_has_approved_admin boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select core.ai_hub_project_id() into v_project_uuid;

  select au.email
  into v_auth_email
  from auth.users au
  where au.id = v_user_id;

  v_profile_name := coalesce(v_profile_name, split_part(coalesce(v_auth_email, ''), '@', 1), 'User');

  select exists (
    select 1
    from core.project_memberships cpm
    where cpm.project_id = v_project_uuid
      and cpm.status = 'approved'
      and cpm.role in ('owner', 'admin')
  )
  into v_has_approved_admin;

  if v_requested_role = 'admin' and not v_has_approved_admin then
    v_member_role := 'owner';
    v_member_status := 'approved';
  elsif v_requested_role = 'admin' then
    v_member_role := 'admin';
    v_member_status := 'pending';
  else
    v_member_role := 'user';
    v_member_status := 'pending';
  end if;

  update core.profiles cpr
  set
    email = coalesce(v_auth_email, ''),
    display_name = v_profile_name,
    updated_at = now()
  where cpr.user_id = v_user_id;

  if not found then
    insert into core.profiles (user_id, email, display_name, updated_at)
    values (v_user_id, coalesce(v_auth_email, ''), v_profile_name, now());
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
    v_project_uuid,
    v_user_id,
    v_member_role,
    v_member_status,
    case when v_member_status = 'approved' then now() else null end,
    case when v_member_status = 'approved' then v_user_id else null end
  )
  on conflict on constraint project_memberships_pkey do nothing;

  if v_requested_role = 'admin' then
    update ai_hub.admin_profiles ahap
    set
      organization = coalesce(nullif(trim(p_organization), ''), 'Unspecified'),
      updated_at = now()
    where ahap.user_id = v_user_id;

    if not found then
      insert into ai_hub.admin_profiles (user_id, organization, updated_at)
      values (v_user_id, coalesce(nullif(trim(p_organization), ''), 'Unspecified'), now());
    end if;
  end if;

  return public.get_ai_hub_session();
end
$$;

create or replace function public.list_ai_hub_members()
returns jsonb
language sql
stable
security definer
set search_path = public, core, ai_hub
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', member_rows.user_id,
        'project_id', member_rows.project_id,
        'email', member_rows.email,
        'display_name', member_rows.display_name,
        'organization', member_rows.organization,
        'role', member_rows.role,
        'status', member_rows.status,
        'created_at', member_rows.created_at,
        'approved_at', member_rows.approved_at
      )
      order by member_rows.sort_status, member_rows.created_at desc
    ),
    '[]'::jsonb
  )
  from (
    select
      au.id as user_id,
      cp.id as project_id,
      coalesce(cpr.email, au.email) as email,
      coalesce(cpr.display_name, split_part(coalesce(au.email, ''), '@', 1), 'User') as display_name,
      ahap.organization as organization,
      cpm.role as role,
      cpm.status as status,
      cpm.created_at as created_at,
      cpm.approved_at as approved_at,
      case cpm.status when 'pending' then 0 when 'approved' then 1 else 2 end as sort_status
    from core.project_memberships cpm
    join core.projects cp
      on cp.id = cpm.project_id
     and cp.slug = 'ai_hub'
    join auth.users au
      on au.id = cpm.user_id
    left join core.profiles cpr
      on cpr.user_id = au.id
    left join ai_hub.admin_profiles ahap
      on ahap.user_id = au.id
    where core.is_ai_hub_admin()
    limit 200
  ) member_rows
$$;

grant execute on function public.get_ai_hub_session() to authenticated;
grant execute on function public.ensure_ai_hub_membership(text, text, text) to authenticated;
grant execute on function public.list_ai_hub_members() to authenticated;

notify pgrst, 'reload schema';
