-- Limit environment config returned to browsers to fields consumed by apps.
-- This also prevents future admin-only keys from being exposed by default.

create or replace function ai_hub.public_environment_data(p_data jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, ai_hub
as $$
declare
  provider_data jsonb := ai_hub.publicize_provider_fields(coalesce(p_data, '{}'::jsonb));
  app_settings jsonb := coalesce(p_data->'ai_app_settings', '{}'::jsonb);
  result jsonb;
  public_apps jsonb := '{}'::jsonb;
  app_data jsonb;
  app_id text;
  public_keys text[] := array[
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
    from jsonb_each(provider_data) as item
   where item.key = any(public_keys);

  if jsonb_typeof(app_settings) = 'object' then
    for app_id in select jsonb_object_keys(app_settings)
    loop
      if jsonb_typeof(app_settings->app_id) = 'object' then
        select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
          into app_data
          from jsonb_each(ai_hub.publicize_provider_fields(app_settings->app_id)) as item
         where item.key = any(public_keys);
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

notify pgrst, 'reload schema';
