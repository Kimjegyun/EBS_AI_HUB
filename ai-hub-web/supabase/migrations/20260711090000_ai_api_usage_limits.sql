create table if not exists ai_hub.user_api_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_limit integer not null default 100 check (monthly_limit >= 0),
  used_this_month integer not null default 0 check (used_this_month >= 0),
  period text not null default to_char(now(), 'YYYY-MM'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table ai_hub.user_api_usage enable row level security;

drop policy if exists "api_usage_select_self_or_admin" on ai_hub.user_api_usage;
create policy "api_usage_select_self_or_admin"
  on ai_hub.user_api_usage for select
  to authenticated
  using (user_id = auth.uid() or core.is_ai_hub_admin());

drop policy if exists "api_usage_admin_write" on ai_hub.user_api_usage;
create policy "api_usage_admin_write"
  on ai_hub.user_api_usage for all
  to authenticated
  using (core.is_ai_hub_admin())
  with check (core.is_ai_hub_admin());

create or replace function public.ai_hub_get_my_api_usage_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, core, ai_hub
as $$
declare
  v_user uuid := auth.uid();
  v_period text := to_char(now(), 'YYYY-MM');
  v_row ai_hub.user_api_usage%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication is required.';
  end if;

  insert into ai_hub.user_api_usage (user_id, period)
  values (v_user, v_period)
  on conflict (user_id) do nothing;

  update ai_hub.user_api_usage
  set used_this_month = 0,
      period = v_period,
      updated_at = now()
  where user_id = v_user
    and period <> v_period;

  select * into v_row
  from ai_hub.user_api_usage
  where user_id = v_user;

  return jsonb_build_object(
    'user_id', v_row.user_id,
    'monthly_limit', v_row.monthly_limit,
    'used_this_month', v_row.used_this_month,
    'period', v_row.period
  );
end
$$;

create or replace function public.ai_hub_consume_api_usage_v1(p_units integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = public, core, ai_hub
as $$
declare
  v_user uuid := auth.uid();
  v_units integer := greatest(coalesce(p_units, 1), 0);
  v_period text := to_char(now(), 'YYYY-MM');
  v_row ai_hub.user_api_usage%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication is required.';
  end if;

  insert into ai_hub.user_api_usage (user_id, period)
  values (v_user, v_period)
  on conflict (user_id) do nothing;

  update ai_hub.user_api_usage
  set used_this_month = 0,
      period = v_period,
      updated_at = now()
  where user_id = v_user
    and period <> v_period;

  select * into v_row
  from ai_hub.user_api_usage
  where user_id = v_user
  for update;

  if v_row.used_this_month + v_units > v_row.monthly_limit then
    return jsonb_build_object(
      'ok', false,
      'error', 'API 사용 한도를 초과했습니다. 관리자에게 한도 조정을 요청하세요.',
      'monthly_limit', v_row.monthly_limit,
      'used_this_month', v_row.used_this_month,
      'period', v_row.period
    );
  end if;

  update ai_hub.user_api_usage
  set used_this_month = used_this_month + v_units,
      updated_at = now()
  where user_id = v_user
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'monthly_limit', v_row.monthly_limit,
    'used_this_month', v_row.used_this_month,
    'period', v_row.period
  );
end
$$;

create or replace function public.ai_hub_list_api_usage_v1()
returns jsonb
language sql
stable
security definer
set search_path = public, core, ai_hub
as $$
  select case
    when not core.is_ai_hub_admin() then '[]'::jsonb
    else coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', u.user_id,
          'monthly_limit', u.monthly_limit,
          'used_this_month', case
            when u.period = to_char(now(), 'YYYY-MM') then u.used_this_month
            else 0
          end,
          'period', case
            when u.period = to_char(now(), 'YYYY-MM') then u.period
            else to_char(now(), 'YYYY-MM')
          end
        )
        order by u.updated_at desc
      ),
      '[]'::jsonb
    )
  end
  from ai_hub.user_api_usage as u
$$;

create or replace function public.ai_hub_set_user_api_limit_v1(
  p_user_id uuid,
  p_monthly_limit integer
)
returns void
language plpgsql
security definer
set search_path = public, core, ai_hub
as $$
declare
  v_period text := to_char(now(), 'YYYY-MM');
begin
  if not core.is_ai_hub_admin() then
    raise exception 'Admin permission is required.';
  end if;

  insert into ai_hub.user_api_usage (
    user_id,
    monthly_limit,
    used_this_month,
    period,
    updated_at,
    updated_by
  )
  values (
    p_user_id,
    greatest(coalesce(p_monthly_limit, 0), 0),
    0,
    v_period,
    now(),
    auth.uid()
  )
  on conflict (user_id) do update
  set monthly_limit = excluded.monthly_limit,
      period = case
        when ai_hub.user_api_usage.period = v_period then ai_hub.user_api_usage.period
        else v_period
      end,
      used_this_month = case
        when ai_hub.user_api_usage.period = v_period then ai_hub.user_api_usage.used_this_month
        else 0
      end,
      updated_at = now(),
      updated_by = auth.uid();
end
$$;

grant execute on function public.ai_hub_get_my_api_usage_v1() to authenticated;
grant execute on function public.ai_hub_consume_api_usage_v1(integer) to authenticated;
grant execute on function public.ai_hub_list_api_usage_v1() to authenticated;
grant execute on function public.ai_hub_set_user_api_limit_v1(uuid, integer) to authenticated;
