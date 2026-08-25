-- Strip API keys from environment config reads, merge secrets on save,
-- and lock the legacy public.environment_config table.

create or replace function ai_hub.public_environment_data(p_data jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := coalesce(p_data, '{}'::jsonb);
  openai_key text := result->>'ai_openai_api_key';
  fal_key text := result->>'ai_fal_api_key';
begin
  result := result
    - 'ai_openai_api_key'
    - 'ai_fal_api_key';
  result := result || jsonb_build_object(
    'ai_openai_api_key_configured', coalesce(length(openai_key) > 0, false),
    'ai_fal_api_key_configured', coalesce(length(fal_key) > 0, false)
  );
  return result;
end;
$$;

create or replace function ai_hub.merge_environment_config(p_existing jsonb, p_incoming jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  existing jsonb := coalesce(p_existing, '{}'::jsonb);
  incoming jsonb := coalesce(p_incoming, '{}'::jsonb);
  merged jsonb;
  incoming_openai text;
  incoming_fal text;
begin
  merged := existing || incoming;
  merged := merged - 'ai_openai_api_key_configured' - 'ai_fal_api_key_configured';

  incoming_openai := incoming->>'ai_openai_api_key';
  if incoming_openai is null or btrim(incoming_openai) = '' or incoming_openai like '%...%' then
    if existing ? 'ai_openai_api_key' then
      merged := jsonb_set(merged, '{ai_openai_api_key}', existing->'ai_openai_api_key', true);
    else
      merged := merged - 'ai_openai_api_key';
    end if;
  end if;

  incoming_fal := incoming->>'ai_fal_api_key';
  if incoming_fal is null or btrim(incoming_fal) = '' or incoming_fal like '%...%' then
    if existing ? 'ai_fal_api_key' then
      merged := jsonb_set(merged, '{ai_fal_api_key}', existing->'ai_fal_api_key', true);
    else
      merged := merged - 'ai_fal_api_key';
    end if;
  end if;

  return merged;
end;
$$;

create or replace function public.get_ai_hub_environment_config()
returns table (data jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, core, ai_hub
as $$
  select ai_hub.public_environment_data(ec.data), ec.updated_at
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
declare
  v_existing jsonb;
  v_merged jsonb;
begin
  if not core.is_ai_hub_admin() then
    raise exception 'AI HUB admin permission is required.';
  end if;

  select ec.data into v_existing
  from ai_hub.environment_config as ec
  where ec.id = 1;

  v_merged := ai_hub.merge_environment_config(v_existing, p_data);

  insert into ai_hub.environment_config (id, data, updated_at, updated_by)
  values (1, v_merged, now(), auth.uid())
  on conflict (id) do update
  set data = excluded.data,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;
end
$$;

create or replace function public.ai_hub_proxy_get_provider_config()
returns jsonb
language plpgsql
security definer
set search_path = public, ai_hub
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed.';
  end if;

  return coalesce(
    (select ec.data from ai_hub.environment_config as ec where ec.id = 1),
    '{}'::jsonb
  );
end
$$;

revoke all on function public.ai_hub_proxy_get_provider_config() from public, anon, authenticated;
grant execute on function public.ai_hub_proxy_get_provider_config() to service_role;

grant execute on function public.get_ai_hub_environment_config() to authenticated;
grant execute on function public.save_ai_hub_environment_config(jsonb) to authenticated;

do $$
begin
  if to_regclass('public.environment_config') is not null then
    drop policy if exists "environment_config_select" on public.environment_config;
    drop policy if exists "environment_config_insert" on public.environment_config;
    drop policy if exists "environment_config_update" on public.environment_config;
    drop policy if exists "environment_config_deny_all" on public.environment_config;
    create policy "environment_config_deny_all"
      on public.environment_config
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end
$$;

notify pgrst, 'reload schema';
