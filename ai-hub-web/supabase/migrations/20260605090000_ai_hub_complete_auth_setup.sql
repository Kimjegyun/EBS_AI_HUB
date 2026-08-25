create schema if not exists core;
create schema if not exists ai_hub;

create table if not exists core.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

insert into core.projects (slug, name)
values ('ai_hub', 'AI HUB')
on conflict (slug) do update set name = excluded.name;

create table if not exists core.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.project_memberships (
  project_id uuid not null references core.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'user')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  primary key (project_id, user_id)
);

create index if not exists project_memberships_user_idx
  on core.project_memberships (user_id);

create index if not exists project_memberships_project_status_idx
  on core.project_memberships (project_id, status);

create table if not exists ai_hub.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_hub.environment_config (
  id smallint primary key default 1 constraint environment_config_single_row check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into ai_hub.environment_config (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

alter table core.projects enable row level security;
alter table core.profiles enable row level security;
alter table core.project_memberships enable row level security;
alter table ai_hub.admin_profiles enable row level security;
alter table ai_hub.environment_config enable row level security;

create or replace function core.ai_hub_project_id()
returns uuid
language sql
stable
security definer
set search_path = core
as $$
  select cp.id
  from core.projects as cp
  where cp.slug = 'ai_hub'
  limit 1
$$;

create or replace function core.is_ai_hub_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = core
as $$
  select exists (
    select 1
    from core.project_memberships as cpm
    where cpm.project_id = core.ai_hub_project_id()
      and cpm.user_id = p_user_id
      and cpm.status = 'approved'
      and cpm.role in ('owner', 'admin')
  )
$$;

drop policy if exists "projects_select_member" on core.projects;
create policy "projects_select_member"
  on core.projects for select
  to authenticated
  using (
    exists (
      select 1
      from core.project_memberships as cpm
      where cpm.project_id = projects.id
        and cpm.user_id = auth.uid()
        and cpm.status = 'approved'
    )
  );

drop policy if exists "profiles_select_self_or_ai_hub_admin" on core.profiles;
create policy "profiles_select_self_or_ai_hub_admin"
  on core.profiles for select
  to authenticated
  using (user_id = auth.uid() or core.is_ai_hub_admin());

drop policy if exists "profiles_update_self" on core.profiles;
create policy "profiles_update_self"
  on core.profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "memberships_select_self_or_ai_hub_admin" on core.project_memberships;
create policy "memberships_select_self_or_ai_hub_admin"
  on core.project_memberships for select
  to authenticated
  using (user_id = auth.uid() or core.is_ai_hub_admin());

drop policy if exists "memberships_update_ai_hub_admin" on core.project_memberships;
create policy "memberships_update_ai_hub_admin"
  on core.project_memberships for update
  to authenticated
  using (core.is_ai_hub_admin())
  with check (core.is_ai_hub_admin());

drop policy if exists "admin_profiles_select_self_or_ai_hub_admin" on ai_hub.admin_profiles;
create policy "admin_profiles_select_self_or_ai_hub_admin"
  on ai_hub.admin_profiles for select
  to authenticated
  using (user_id = auth.uid() or core.is_ai_hub_admin());

drop policy if exists "environment_config_select_approved_member" on ai_hub.environment_config;
create policy "environment_config_select_approved_member"
  on ai_hub.environment_config for select
  to authenticated
  using (
    exists (
      select 1
      from core.project_memberships as cpm
      where cpm.project_id = core.ai_hub_project_id()
        and cpm.user_id = auth.uid()
        and cpm.status = 'approved'
    )
  );

drop policy if exists "environment_config_write_ai_hub_admin" on ai_hub.environment_config;
create policy "environment_config_write_ai_hub_admin"
  on ai_hub.environment_config for all
  to authenticated
  using (core.is_ai_hub_admin())
  with check (core.is_ai_hub_admin());

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
      join core.projects as cp on cp.slug = 'ai_hub'
      join core.project_memberships as cpm
        on cpm.project_id = cp.id
       and cpm.user_id = au.id
      left join core.profiles as cpr on cpr.user_id = au.id
      left join ai_hub.admin_profiles as ahap on ahap.user_id = au.id
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

  insert into core.profiles (user_id, email, display_name, updated_at)
  values (v_current_user, coalesce(v_auth_email, ''), v_profile_name, now())
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
    v_ai_hub_project,
    v_current_user,
    v_next_role,
    v_next_status,
    case when v_next_status = 'approved' then now() else null end,
    case when v_next_status = 'approved' then v_current_user else null end
  )
  on conflict on constraint project_memberships_pkey do update
  set role = case
        when core.project_memberships.status = 'approved' then core.project_memberships.role
        else excluded.role
      end,
      status = case
        when core.project_memberships.status = 'approved' then core.project_memberships.status
        else excluded.status
      end;

  if v_requested_role = 'admin' then
    insert into ai_hub.admin_profiles (user_id, organization, updated_at)
    values (v_current_user, coalesce(nullif(trim(p_organization), ''), 'Unspecified'), now())
    on conflict (user_id) do update
    set organization = excluded.organization,
        updated_at = now();
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
    join auth.users as au on au.id = cpm.user_id
    left join core.profiles as cpr on cpr.user_id = au.id
    left join ai_hub.admin_profiles as ahap on ahap.user_id = au.id
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
  set status = v_next_status,
      role = v_next_role,
      approved_at = case when v_next_status = 'approved' then now() else null end,
      approved_by = case when v_next_status = 'approved' then auth.uid() else null end
  where cpm.project_id = v_ai_hub_project
    and cpm.user_id = p_user_id;
end
$$;

create or replace function public.ai_hub_resolve_login_email_v1(p_login_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select au.email
  from auth.users as au
  where lower(coalesce(au.raw_user_meta_data ->> 'login_id', '')) = lower(trim(p_login_id))
  order by au.created_at asc
  limit 1
$$;

create or replace function public.ai_hub_is_login_id_available_v1(p_login_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from auth.users as au
    where lower(coalesce(au.raw_user_meta_data ->> 'login_id', '')) = lower(trim(p_login_id))
  )
$$;

create or replace function public.get_ai_hub_environment_config()
returns table (data jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, core, ai_hub
as $$
  select ec.data, ec.updated_at
  from ai_hub.environment_config as ec
  where ec.id = 1
    and (
      core.is_ai_hub_admin()
      or exists (
        select 1
        from core.project_memberships as cpm
        where cpm.project_id = core.ai_hub_project_id()
          and cpm.user_id = auth.uid()
          and cpm.status = 'approved'
      )
    )
$$;

create or replace function public.save_ai_hub_environment_config(p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public, core, ai_hub
as $$
begin
  if not core.is_ai_hub_admin() then
    raise exception 'AI HUB admin permission is required.';
  end if;

  insert into ai_hub.environment_config (id, data, updated_at, updated_by)
  values (1, coalesce(p_data, '{}'::jsonb), now(), auth.uid())
  on conflict (id) do update
  set data = excluded.data,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;
end
$$;

grant usage on schema core to authenticated;
grant usage on schema ai_hub to authenticated;

grant execute on function core.ai_hub_project_id() to authenticated;
grant execute on function core.is_ai_hub_admin(uuid) to authenticated;

grant execute on function public.ai_hub_get_session_v2() to authenticated;
grant execute on function public.ai_hub_ensure_membership_v2(text, text, text) to authenticated;
grant execute on function public.ai_hub_list_members_v2() to authenticated;
grant execute on function public.ai_hub_update_member_v2(uuid, text, text) to authenticated;
grant execute on function public.ai_hub_resolve_login_email_v1(text) to anon, authenticated;
grant execute on function public.ai_hub_is_login_id_available_v1(text) to anon, authenticated;
grant execute on function public.get_ai_hub_environment_config() to authenticated;
grant execute on function public.save_ai_hub_environment_config(jsonb) to authenticated;

notify pgrst, 'reload schema';
