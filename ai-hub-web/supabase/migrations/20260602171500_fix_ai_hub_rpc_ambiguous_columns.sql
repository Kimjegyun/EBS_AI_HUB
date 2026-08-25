create or replace function public.get_ai_hub_session()
returns table (
  user_id uuid,
  project_id uuid,
  email text,
  display_name text,
  organization text,
  role text,
  status text
)
language sql
stable
security definer
set search_path = public, core, ai_hub
as $$
  select
    au.id as user_id,
    cp.id as project_id,
    coalesce(cpr.email, au.email) as email,
    coalesce(cpr.display_name, split_part(coalesce(au.email, ''), '@', 1), 'User') as display_name,
    ahap.organization as organization,
    cpm.role as role,
    cpm.status as status
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
$$;

create or replace function public.ensure_ai_hub_membership(
  p_display_name text,
  p_organization text default null,
  p_requested_role text default 'user'
)
returns table (
  user_id uuid,
  project_id uuid,
  email text,
  display_name text,
  organization text,
  role text,
  status text
)
language plpgsql
security definer
set search_path = public, core, ai_hub
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_project_id uuid := core.ai_hub_project_id();
  v_display_name text := nullif(trim(coalesce(p_display_name, '')), '');
  v_requested_role text := case when p_requested_role = 'admin' then 'admin' else 'user' end;
  v_role text;
  v_status text;
  v_has_approved_admin boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select au.email into v_email
  from auth.users as au
  where au.id = v_user_id;

  v_display_name := coalesce(v_display_name, split_part(coalesce(v_email, ''), '@', 1), 'User');

  select exists (
    select 1
    from core.project_memberships as cpm
    where cpm.project_id = v_project_id
      and cpm.status = 'approved'
      and cpm.role in ('owner', 'admin')
  ) into v_has_approved_admin;

  if v_requested_role = 'admin' and not v_has_approved_admin then
    v_role := 'owner';
    v_status := 'approved';
  elsif v_requested_role = 'admin' then
    v_role := 'admin';
    v_status := 'pending';
  else
    v_role := 'user';
    v_status := 'pending';
  end if;

  insert into core.profiles (user_id, email, display_name, updated_at)
  values (v_user_id, coalesce(v_email, ''), v_display_name, now())
  on conflict (user_id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      updated_at = now();

  insert into core.project_memberships (
    project_id,
    user_id,
    role,
    status,
    approved_at,
    approved_by
  )
  values (
    v_project_id,
    v_user_id,
    v_role,
    v_status,
    case when v_status = 'approved' then now() else null end,
    case when v_status = 'approved' then v_user_id else null end
  )
  on conflict (project_id, user_id) do nothing;

  if v_requested_role = 'admin' then
    insert into ai_hub.admin_profiles (user_id, organization, updated_at)
    values (v_user_id, coalesce(nullif(trim(p_organization), ''), 'Unspecified'), now())
    on conflict (user_id) do update
    set organization = excluded.organization,
        updated_at = now();
  end if;

  return query
  select
    s.user_id,
    s.project_id,
    s.email,
    s.display_name,
    s.organization,
    s.role,
    s.status
  from public.get_ai_hub_session() as s;
end
$$;

create or replace function public.list_ai_hub_members()
returns table (
  user_id uuid,
  project_id uuid,
  email text,
  display_name text,
  organization text,
  role text,
  status text,
  created_at timestamptz,
  approved_at timestamptz
)
language sql
stable
security definer
set search_path = public, core, ai_hub
as $$
  select
    au.id as user_id,
    cp.id as project_id,
    coalesce(cpr.email, au.email) as email,
    coalesce(cpr.display_name, split_part(coalesce(au.email, ''), '@', 1), 'User') as display_name,
    ahap.organization as organization,
    cpm.role as role,
    cpm.status as status,
    cpm.created_at as created_at,
    cpm.approved_at as approved_at
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
  order by
    case cpm.status when 'pending' then 0 when 'approved' then 1 else 2 end,
    cpm.created_at desc
  limit 200
$$;

grant execute on function public.get_ai_hub_session() to authenticated;
grant execute on function public.ensure_ai_hub_membership(text, text, text) to authenticated;
grant execute on function public.list_ai_hub_members() to authenticated;

notify pgrst, 'reload schema';
