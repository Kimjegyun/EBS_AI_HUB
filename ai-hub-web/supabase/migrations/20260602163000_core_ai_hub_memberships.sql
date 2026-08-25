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

do $$
begin
  if to_regclass('public.environment_config') is not null then
    insert into ai_hub.environment_config (id, data, updated_at)
    select id, data, updated_at
    from public.environment_config
    on conflict (id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at;
  end if;
end
$$;

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
  select id from core.projects where slug = 'ai_hub'
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
    from core.project_memberships pm
    where pm.project_id = core.ai_hub_project_id()
      and pm.user_id = p_user_id
      and pm.status = 'approved'
      and pm.role in ('owner', 'admin')
  )
$$;

create policy "projects_select_member"
  on core.projects for select
  to authenticated
  using (
    exists (
      select 1
      from core.project_memberships pm
      where pm.project_id = projects.id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
  );

create policy "profiles_select_self_or_ai_hub_admin"
  on core.profiles for select
  to authenticated
  using (user_id = auth.uid() or core.is_ai_hub_admin());

create policy "profiles_update_self"
  on core.profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "memberships_select_self_or_ai_hub_admin"
  on core.project_memberships for select
  to authenticated
  using (user_id = auth.uid() or core.is_ai_hub_admin());

create policy "memberships_update_ai_hub_admin"
  on core.project_memberships for update
  to authenticated
  using (core.is_ai_hub_admin())
  with check (core.is_ai_hub_admin());

create policy "admin_profiles_select_self_or_ai_hub_admin"
  on ai_hub.admin_profiles for select
  to authenticated
  using (user_id = auth.uid() or core.is_ai_hub_admin());

create policy "environment_config_select_approved_member"
  on ai_hub.environment_config for select
  to authenticated
  using (
    exists (
      select 1
      from core.project_memberships pm
      where pm.project_id = core.ai_hub_project_id()
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
  );

create policy "environment_config_write_ai_hub_admin"
  on ai_hub.environment_config for all
  to authenticated
  using (core.is_ai_hub_admin())
  with check (core.is_ai_hub_admin());

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
    u.id,
    p.id,
    coalesce(pr.email, u.email),
    coalesce(pr.display_name, split_part(coalesce(u.email, ''), '@', 1), 'User'),
    ap.organization,
    pm.role,
    pm.status
  from auth.users u
  join core.projects p on p.slug = 'ai_hub'
  join core.project_memberships pm on pm.project_id = p.id and pm.user_id = u.id
  left join core.profiles pr on pr.user_id = u.id
  left join ai_hub.admin_profiles ap on ap.user_id = u.id
  where u.id = auth.uid()
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

  select u.email into v_email
  from auth.users u
  where u.id = v_user_id;
  v_display_name := coalesce(v_display_name, split_part(coalesce(v_email, ''), '@', 1), 'User');

  select exists (
    select 1
    from core.project_memberships
    where project_id = v_project_id
      and status = 'approved'
      and role in ('owner', 'admin')
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

  return query select * from public.get_ai_hub_session();
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
    u.id,
    p.id,
    coalesce(pr.email, u.email),
    coalesce(pr.display_name, split_part(coalesce(u.email, ''), '@', 1), 'User'),
    ap.organization,
    pm.role,
    pm.status,
    pm.created_at,
    pm.approved_at
  from core.project_memberships pm
  join core.projects p on p.id = pm.project_id and p.slug = 'ai_hub'
  join auth.users u on u.id = pm.user_id
  left join core.profiles pr on pr.user_id = u.id
  left join ai_hub.admin_profiles ap on ap.user_id = u.id
  where core.is_ai_hub_admin()
  order by
    case pm.status when 'pending' then 0 when 'approved' then 1 else 2 end,
    pm.created_at desc
  limit 200
$$;

create or replace function public.update_ai_hub_member(
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
  v_project_id uuid := core.ai_hub_project_id();
  v_status text := case when p_status in ('pending', 'approved', 'rejected') then p_status else 'pending' end;
  v_role text := case when p_role in ('owner', 'admin', 'user') then p_role else 'user' end;
begin
  if not core.is_ai_hub_admin() then
    raise exception 'AI HUB admin permission is required.';
  end if;

  update core.project_memberships
  set status = v_status,
      role = v_role,
      approved_at = case when v_status = 'approved' then now() else null end,
      approved_by = case when v_status = 'approved' then auth.uid() else null end
  where project_id = v_project_id
    and user_id = p_user_id;
end
$$;

create or replace function public.get_ai_hub_environment_config()
returns table (data jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, core, ai_hub
as $$
  select ec.data, ec.updated_at
  from ai_hub.environment_config ec
  where ec.id = 1
    and (
      core.is_ai_hub_admin()
      or exists (
        select 1
        from core.project_memberships pm
        where pm.project_id = core.ai_hub_project_id()
          and pm.user_id = auth.uid()
          and pm.status = 'approved'
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
grant execute on function public.get_ai_hub_session() to authenticated;
grant execute on function public.ensure_ai_hub_membership(text, text, text) to authenticated;
grant execute on function public.list_ai_hub_members() to authenticated;
grant execute on function public.update_ai_hub_member(uuid, text, text) to authenticated;
grant execute on function public.get_ai_hub_environment_config() to authenticated;
grant execute on function public.save_ai_hub_environment_config(jsonb) to authenticated;

notify pgrst, 'reload schema';
