-- Do not expose provider secrets or admin-only configuration through the
-- environment config RPC. Approved members receive only app-consumable fields.

create or replace function ai_hub.publicize_provider_fields(p_data jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  result jsonb := coalesce(p_data, '{}'::jsonb);
  secret_key text;
  configured boolean;
begin
  foreach secret_key in array array[
    'ai_openai_api_key',
    'ai_fal_api_key',
    'ai_tencent_api_key',
    'ai_together_api_key'
  ] loop
    configured := coalesce(
      length(btrim(result->>secret_key)) > 0
      and (result->>secret_key) not like '%...%',
      false
    );
    result := result - secret_key - (secret_key || '_clear') - (secret_key || '_configured');
    result := result || jsonb_build_object(secret_key || '_configured', configured);
  end loop;
  return result;
end;
$$;

create or replace function ai_hub.public_environment_data(p_data jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, ai_hub
as $$
declare
  result jsonb := ai_hub.publicize_provider_fields(coalesce(p_data, '{}'::jsonb));
  app_settings jsonb := coalesce(p_data->'ai_app_settings', '{}'::jsonb);
  public_apps jsonb := '{}'::jsonb;
  app_id text;
begin
  if jsonb_typeof(app_settings) = 'object' then
    for app_id in select jsonb_object_keys(app_settings)
    loop
      public_apps := public_apps || jsonb_build_object(
        app_id,
        ai_hub.publicize_provider_fields(app_settings->app_id)
      );
    end loop;
    result := jsonb_set(result, '{ai_app_settings}', public_apps, true);
  else
    result := result - 'ai_app_settings';
  end if;
  return result;
end;
$$;

create or replace function ai_hub.public_member_environment_data(p_data jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, ai_hub
as $$
declare
  public_data jsonb := ai_hub.public_environment_data(p_data);
  result jsonb;
  app_settings jsonb := coalesce(public_data->'ai_app_settings', '{}'::jsonb);
  public_apps jsonb := '{}'::jsonb;
  app_id text;
  app_data jsonb;
  member_keys text[] := array[
    'service_display_name',
    'ai_openai_api_key_configured', 'ai_openai_model', 'ai_openai_base_url',
    'ai_fal_api_key_configured', 'ai_fal_base_url', 'ai_fal_models',
    'ai_fal_claude_model', 'ai_fal_grok_model', 'ai_fal_perplexity_model',
    'ai_tencent_api_key_configured', 'ai_tencent_base_url', 'ai_tencent_models',
    'ai_together_api_key_configured', 'ai_together_base_url',
    'ai_together_stt_model', 'ai_together_summary_model'
  ];
begin
  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
    into result
    from jsonb_each(public_data) as item
   where item.key = any(member_keys);

  if jsonb_typeof(app_settings) = 'object' then
    for app_id in select jsonb_object_keys(app_settings)
    loop
      if jsonb_typeof(app_settings->app_id) = 'object' then
        select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
          into app_data
          from jsonb_each(app_settings->app_id) as item
         where item.key = any(member_keys);
      else
        app_data := '{}'::jsonb;
      end if;
      public_apps := public_apps || jsonb_build_object(app_id, app_data);
    end loop;
    result := jsonb_set(result, '{ai_app_settings}', public_apps, true);
  end if;
  return result;
end;
$$;

create or replace function public.get_ai_hub_environment_config()
returns table (data jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, core, ai_hub
as $$
  select case
           when core.is_ai_hub_admin() then ai_hub.public_environment_data(ec.data)
           else ai_hub.public_member_environment_data(ec.data)
         end,
         ec.updated_at
    from ai_hub.environment_config as ec
   where ec.id = 1
     and auth.uid() is not null
     and (
       core.is_ai_hub_admin()
       or exists (
         select 1
           from core.project_memberships as cpm
          where cpm.project_id = core.ai_hub_project_id()
            and cpm.user_id = auth.uid()
            and cpm.status = 'approved'
       )
     );
$$;

revoke all on function ai_hub.publicize_provider_fields(jsonb) from public, anon, authenticated;
revoke all on function ai_hub.public_environment_data(jsonb) from public, anon, authenticated;
revoke all on function ai_hub.public_member_environment_data(jsonb) from public, anon, authenticated;
revoke all on function public.get_ai_hub_environment_config() from public, anon;
grant execute on function public.get_ai_hub_environment_config() to authenticated;

notify pgrst, 'reload schema';
