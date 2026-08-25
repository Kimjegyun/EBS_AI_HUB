-- Publicize and merge nested per-app AI provider settings (ai_app_settings).

create or replace function ai_hub.publicize_provider_fields(p_data jsonb)
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
    - 'ai_fal_api_key'
    - 'ai_openai_api_key_clear'
    - 'ai_fal_api_key_clear';
  result := result || jsonb_build_object(
    'ai_openai_api_key_configured',
    coalesce(openai_key is not null and length(btrim(openai_key)) > 0 and openai_key not like '%...%', false),
    'ai_fal_api_key_configured',
    coalesce(fal_key is not null and length(btrim(fal_key)) > 0 and fal_key not like '%...%', false)
  );
  return result;
end;
$$;

create or replace function ai_hub.merge_provider_fields(p_existing jsonb, p_incoming jsonb)
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
  merged := merged
    - 'ai_openai_api_key_configured'
    - 'ai_fal_api_key_configured'
    - 'ai_openai_api_key_clear'
    - 'ai_fal_api_key_clear';

  if coalesce((incoming->>'ai_openai_api_key_clear')::boolean, false) then
    merged := merged - 'ai_openai_api_key';
  else
    incoming_openai := incoming->>'ai_openai_api_key';
    if incoming_openai is null or btrim(incoming_openai) = '' or incoming_openai like '%...%' then
      if existing ? 'ai_openai_api_key' then
        merged := jsonb_set(merged, '{ai_openai_api_key}', existing->'ai_openai_api_key', true);
      else
        merged := merged - 'ai_openai_api_key';
      end if;
    end if;
  end if;

  if coalesce((incoming->>'ai_fal_api_key_clear')::boolean, false) then
    merged := merged - 'ai_fal_api_key';
  else
    incoming_fal := incoming->>'ai_fal_api_key';
    if incoming_fal is null or btrim(incoming_fal) = '' or incoming_fal like '%...%' then
      if existing ? 'ai_fal_api_key' then
        merged := jsonb_set(merged, '{ai_fal_api_key}', existing->'ai_fal_api_key', true);
      else
        merged := merged - 'ai_fal_api_key';
      end if;
    end if;
  end if;

  return merged;
end;
$$;

create or replace function ai_hub.public_environment_data(p_data jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb;
  app_settings jsonb;
  public_apps jsonb := '{}'::jsonb;
  app_id text;
begin
  result := ai_hub.publicize_provider_fields(p_data);
  app_settings := coalesce(p_data->'ai_app_settings', '{}'::jsonb);
  if jsonb_typeof(app_settings) = 'object' then
    for app_id in select jsonb_object_keys(app_settings)
    loop
      public_apps := public_apps || jsonb_build_object(
        app_id,
        ai_hub.publicize_provider_fields(app_settings->app_id)
      );
    end loop;
  end if;
  result := jsonb_set(result, '{ai_app_settings}', public_apps, true);
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
  existing_apps jsonb;
  incoming_apps jsonb;
  merged_apps jsonb;
  app_id text;
begin
  merged := ai_hub.merge_provider_fields(existing, incoming);

  if incoming ? 'ai_app_settings' and jsonb_typeof(incoming->'ai_app_settings') = 'object' then
    existing_apps := coalesce(existing->'ai_app_settings', '{}'::jsonb);
    incoming_apps := incoming->'ai_app_settings';
    merged_apps := existing_apps;
    for app_id in select jsonb_object_keys(incoming_apps)
    loop
      merged_apps := merged_apps || jsonb_build_object(
        app_id,
        ai_hub.merge_provider_fields(
          coalesce(existing_apps->app_id, '{}'::jsonb),
          incoming_apps->app_id
        )
      );
    end loop;
    merged := jsonb_set(merged, '{ai_app_settings}', merged_apps, true);
  end if;

  return merged;
end;
$$;

notify pgrst, 'reload schema';
