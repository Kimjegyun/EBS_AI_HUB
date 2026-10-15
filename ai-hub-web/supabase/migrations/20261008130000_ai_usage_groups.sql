-- AI turn-limit groups, stored on the server and actually enforced.
--
-- Before, groups lived only in the admin's browser (localStorage) and never
-- applied. Now a member can belong to one group; a group member's effective monthly
-- limit is the group's limit, otherwise their own. Usage reads and the consume
-- check both use ai_hub.effective_api_limit.

create table if not exists ai_hub.api_usage_groups (
  group_id text primary key check (group_id ~ '^[A-Za-z0-9_-]{1,60}$'),
  group_name text not null check (length(btrim(group_name)) between 1 and 40),
  monthly_limit integer not null check (monthly_limit >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table ai_hub.api_usage_groups enable row level security;
drop policy if exists "api_groups_admin_read" on ai_hub.api_usage_groups;
create policy "api_groups_admin_read" on ai_hub.api_usage_groups for select to authenticated using (core.is_ai_hub_admin());

alter table ai_hub.user_api_usage
  add column if not exists group_id text references ai_hub.api_usage_groups(group_id) on delete set null;

create or replace function ai_hub.effective_api_limit(p_row ai_hub.user_api_usage)
returns integer
language sql stable security definer
set search_path = public, core, ai_hub
as $$
  select coalesce((select g.monthly_limit from ai_hub.api_usage_groups g where g.group_id = p_row.group_id), p_row.monthly_limit)
$$;

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
  insert into ai_hub.user_api_usage (user_id, period) values (v_user, v_period) on conflict (user_id) do nothing;
  update ai_hub.user_api_usage set used_this_month = 0, period = v_period, updated_at = now()
   where user_id = v_user and period <> v_period;
  select * into v_row from ai_hub.user_api_usage where user_id = v_user;
  return jsonb_build_object(
    'user_id', v_row.user_id,
    'monthly_limit', ai_hub.effective_api_limit(v_row),
    'used_this_month', v_row.used_this_month,
    'period', v_row.period,
    'group_id', v_row.group_id
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
  v_limit integer;
begin
  if v_user is null then
    raise exception 'Authentication is required.';
  end if;
  insert into ai_hub.user_api_usage (user_id, period) values (v_user, v_period) on conflict (user_id) do nothing;
  update ai_hub.user_api_usage set used_this_month = 0, period = v_period, updated_at = now()
   where user_id = v_user and period <> v_period;
  select * into v_row from ai_hub.user_api_usage where user_id = v_user for update;
  v_limit := ai_hub.effective_api_limit(v_row);
  if v_row.used_this_month + v_units > v_limit then
    return jsonb_build_object(
      'ok', false,
      'error', 'API 사용 한도를 초과했습니다. 관리자에게 한도 조정을 요청하세요.',
      'monthly_limit', v_limit,
      'used_this_month', v_row.used_this_month,
      'period', v_row.period
    );
  end if;
  update ai_hub.user_api_usage set used_this_month = used_this_month + v_units, updated_at = now()
   where user_id = v_user returning * into v_row;
  return jsonb_build_object('ok', true, 'monthly_limit', v_limit, 'used_this_month', v_row.used_this_month, 'period', v_row.period);
end
$$;

-- monthly_limit is the effective limit; own_limit is the individual one kept for when the user leaves the group.
create or replace function public.ai_hub_list_api_usage_v1()
returns jsonb
language sql
stable
security definer
set search_path = public, core, ai_hub
as $$
  select case
    when not core.is_ai_hub_admin() then '[]'::jsonb
    else coalesce(jsonb_agg(jsonb_build_object(
      'user_id', u.user_id,
      'monthly_limit', ai_hub.effective_api_limit(u),
      'own_limit', u.monthly_limit,
      'group_id', u.group_id,
      'used_this_month', case when u.period = to_char(now(), 'YYYY-MM') then u.used_this_month else 0 end,
      'period', to_char(now(), 'YYYY-MM')
    ) order by u.updated_at desc), '[]'::jsonb)
  end
  from ai_hub.user_api_usage as u
$$;

create or replace function public.ai_hub_list_api_groups_v1()
returns jsonb
language sql stable security definer
set search_path = public, core, ai_hub
as $$
  select case when not core.is_ai_hub_admin() then '[]'::jsonb else coalesce(jsonb_agg(jsonb_build_object(
    'group_id', g.group_id,
    'group_name', g.group_name,
    'monthly_limit', g.monthly_limit,
    'member_count', (select count(*) from ai_hub.user_api_usage u where u.group_id = g.group_id)
  ) order by g.group_name), '[]'::jsonb) end
  from ai_hub.api_usage_groups g
$$;

create or replace function public.ai_hub_save_api_group_v1(p_group_id text, p_group_name text, p_monthly_limit integer)
returns void
language plpgsql security definer
set search_path = public, core, ai_hub
as $$
begin
  if not core.is_ai_hub_admin() then
    raise exception 'Admin permission is required.';
  end if;
  insert into ai_hub.api_usage_groups (group_id, group_name, monthly_limit, updated_at, updated_by)
  values (p_group_id, btrim(p_group_name), greatest(coalesce(p_monthly_limit, 0), 0), now(), auth.uid())
  on conflict (group_id) do update
    set group_name = excluded.group_name, monthly_limit = excluded.monthly_limit, updated_at = now(), updated_by = auth.uid();
end
$$;

-- Members of a deleted group fall back to their individual limit (FK on delete set null).
create or replace function public.ai_hub_delete_api_group_v1(p_group_id text)
returns void
language plpgsql security definer
set search_path = public, core, ai_hub
as $$
begin
  if not core.is_ai_hub_admin() then
    raise exception 'Admin permission is required.';
  end if;
  delete from ai_hub.api_usage_groups where group_id = p_group_id;
end
$$;

-- p_group_id null = individual limit.
create or replace function public.ai_hub_set_user_api_group_v1(p_user_id uuid, p_group_id text)
returns void
language plpgsql security definer
set search_path = public, core, ai_hub
as $$
begin
  if not core.is_ai_hub_admin() then
    raise exception 'Admin permission is required.';
  end if;
  insert into ai_hub.user_api_usage (user_id, period, group_id, updated_at, updated_by)
  values (p_user_id, to_char(now(), 'YYYY-MM'), nullif(p_group_id, ''), now(), auth.uid())
  on conflict (user_id) do update set group_id = excluded.group_id, updated_at = now(), updated_by = auth.uid();
end
$$;

revoke all on function ai_hub.effective_api_limit(ai_hub.user_api_usage) from public, anon, authenticated;
revoke all on function public.ai_hub_list_api_groups_v1() from public, anon;
revoke all on function public.ai_hub_save_api_group_v1(text, text, integer) from public, anon;
revoke all on function public.ai_hub_delete_api_group_v1(text) from public, anon;
revoke all on function public.ai_hub_set_user_api_group_v1(uuid, text) from public, anon;
grant execute on function public.ai_hub_list_api_groups_v1() to authenticated;
grant execute on function public.ai_hub_save_api_group_v1(text, text, integer) to authenticated;
grant execute on function public.ai_hub_delete_api_group_v1(text) to authenticated;
grant execute on function public.ai_hub_set_user_api_group_v1(uuid, text) to authenticated;

notify pgrst, 'reload schema';
