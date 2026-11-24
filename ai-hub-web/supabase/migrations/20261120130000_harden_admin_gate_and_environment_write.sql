-- Keep the public admin-code check resistant to online guessing. The keyed hash
-- of the caller IP is the only identifier stored; the function uses a service
-- role client and this RPC is unavailable to browser roles.
create table if not exists ai_hub.admin_gate_rate_limits (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0),
  updated_at timestamptz not null default now()
);

alter table ai_hub.admin_gate_rate_limits enable row level security;
revoke all on ai_hub.admin_gate_rate_limits from public, anon, authenticated;
grant usage on schema ai_hub to service_role;
grant select, insert, update, delete on ai_hub.admin_gate_rate_limits to service_role;

create or replace function public.ai_hub_consume_admin_gate_attempt_v1(p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, ai_hub, auth
as $$
declare
  v_window timestamptz;
  v_attempts integer;
  v_now timestamptz := clock_timestamp();
  v_allowed boolean;
  v_retry integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid rate-limit key.' using errcode = '22023';
  end if;

  insert into ai_hub.admin_gate_rate_limits (ip_hash, window_started_at, attempts, updated_at)
  values (p_ip_hash, v_now, 1, v_now)
  on conflict (ip_hash) do update
  set window_started_at = case
        when ai_hub.admin_gate_rate_limits.window_started_at <= v_now - interval '15 minutes' then v_now
        else ai_hub.admin_gate_rate_limits.window_started_at
      end,
      attempts = case
        when ai_hub.admin_gate_rate_limits.window_started_at <= v_now - interval '15 minutes' then 1
        else ai_hub.admin_gate_rate_limits.attempts + 1
      end,
      updated_at = v_now
  returning window_started_at, attempts into v_window, v_attempts;

  delete from ai_hub.admin_gate_rate_limits where updated_at < v_now - interval '7 days';

  v_allowed := v_attempts <= 10;
  v_retry := greatest(1, ceil(extract(epoch from (v_window + interval '15 minutes' - v_now)))::integer);
  return jsonb_build_object('allowed', v_allowed, 'retry_after_seconds', v_retry);
end;
$$;

revoke all on function public.ai_hub_consume_admin_gate_attempt_v1(text) from public, anon, authenticated;
grant execute on function public.ai_hub_consume_admin_gate_attempt_v1(text) to service_role;

-- The function checks the caller's admin membership itself, so anonymous
-- callers have no reason to execute this privileged write RPC.
revoke all on function public.save_ai_hub_environment_config(jsonb) from public, anon;
grant execute on function public.save_ai_hub_environment_config(jsonb) to authenticated;

notify pgrst, 'reload schema';
