-- Organization-wide list of apps registered for users.
create table if not exists ai_hub.published_apps (
  app_id text primary key,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id)
);

alter table ai_hub.published_apps enable row level security;

drop policy if exists "published_apps_select_members" on ai_hub.published_apps;
create policy "published_apps_select_members"
  on ai_hub.published_apps for select
  to authenticated
  using (
    core.is_ai_hub_admin()
    or exists (
      select 1
      from core.project_memberships as cpm
      where cpm.project_id = core.ai_hub_project_id()
        and cpm.user_id = auth.uid()
        and cpm.status = 'approved'
    )
  );

drop policy if exists "published_apps_admin_write" on ai_hub.published_apps;
create policy "published_apps_admin_write"
  on ai_hub.published_apps for all
  to authenticated
  using (core.is_ai_hub_admin())
  with check (core.is_ai_hub_admin());

create or replace function public.ai_hub_list_published_apps()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, core, ai_hub
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not (
    core.is_ai_hub_admin()
    or exists (
      select 1
      from core.project_memberships as cpm
      where cpm.project_id = core.ai_hub_project_id()
        and cpm.user_id = auth.uid()
        and cpm.status = 'approved'
    )
  ) then
    raise exception 'AI HUB membership is required.';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('app_id', pa.app_id, 'published_at', pa.published_at)
        order by pa.published_at desc
      )
      from ai_hub.published_apps as pa
    ),
    '[]'::jsonb
  );
end
$$;

create or replace function public.ai_hub_set_app_published(p_app_id text, p_published boolean)
returns void
language plpgsql
security definer
set search_path = public, core, ai_hub
as $$
begin
  if not core.is_ai_hub_admin() then
    raise exception 'AI HUB admin permission is required.';
  end if;

  if p_app_id is null or btrim(p_app_id) = '' then
    raise exception 'app_id is required.';
  end if;

  if p_published then
    insert into ai_hub.published_apps (app_id, published_at, published_by)
    values (btrim(p_app_id), now(), auth.uid())
    on conflict (app_id) do update
    set published_at = excluded.published_at,
        published_by = excluded.published_by;
  else
    delete from ai_hub.published_apps where app_id = btrim(p_app_id);
  end if;
end
$$;

grant select, insert, update, delete on table ai_hub.published_apps to authenticated;
grant execute on function public.ai_hub_list_published_apps() to authenticated;
grant execute on function public.ai_hub_set_app_published(text, boolean) to authenticated;

notify pgrst, 'reload schema';
