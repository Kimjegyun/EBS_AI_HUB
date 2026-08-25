-- Include Tencent API keys in secret publicize/merge.

create or replace function ai_hub.publicize_provider_fields(p_data jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := coalesce(p_data, '{}'::jsonb);
  openai_key text := result->>'ai_openai_api_key';
  fal_key text := result->>'ai_fal_api_key';
  tencent_key text := result->>'ai_tencent_api_key';
begin
  result := result
    - 'ai_openai_api_key'
    - 'ai_fal_api_key'
    - 'ai_tencent_api_key'
    - 'ai_openai_api_key_clear'
    - 'ai_fal_api_key_clear'
    - 'ai_tencent_api_key_clear';
  result := result || jsonb_build_object(
    'ai_openai_api_key_configured',
    coalesce(openai_key is not null and length(btrim(openai_key)) > 0 and openai_key not like '%...%', false),
    'ai_fal_api_key_configured',
    coalesce(fal_key is not null and length(btrim(fal_key)) > 0 and fal_key not like '%...%', false),
    'ai_tencent_api_key_configured',
    coalesce(tencent_key is not null and length(btrim(tencent_key)) > 0 and tencent_key not like '%...%', false)
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
  incoming_tencent text;
begin
  merged := existing || incoming;
  merged := merged
    - 'ai_openai_api_key_configured'
    - 'ai_fal_api_key_configured'
    - 'ai_tencent_api_key_configured'
    - 'ai_openai_api_key_clear'
    - 'ai_fal_api_key_clear'
    - 'ai_tencent_api_key_clear';

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

  if coalesce((incoming->>'ai_tencent_api_key_clear')::boolean, false) then
    merged := merged - 'ai_tencent_api_key';
  else
    incoming_tencent := incoming->>'ai_tencent_api_key';
    if incoming_tencent is null or btrim(incoming_tencent) = '' or incoming_tencent like '%...%' then
      if existing ? 'ai_tencent_api_key' then
        merged := jsonb_set(merged, '{ai_tencent_api_key}', existing->'ai_tencent_api_key', true);
      else
        merged := merged - 'ai_tencent_api_key';
      end if;
    end if;
  end if;

  return merged;
end;
$$;

notify pgrst, 'reload schema';
