-- Email/ID signups appear in the admin approval list immediately.
--
-- Before: email confirmation is required, so signUp returns no session and the
-- client could not call ai_hub_ensure_membership_v2. The pending membership was
-- only created on the user's first login after clicking the email link, so the
-- admin saw nothing until then (Google signups were unaffected).
--
-- Now a trigger on auth.users creates the pending membership when an account from
-- the email/ID form (it carries user_metadata.login_id) is created. It never grants
-- owner or approval: owner bootstrap and approvals still follow
-- ai_hub_ensure_membership_v2 and the admin. Any error is swallowed so signup itself
-- can never fail because of this trigger.

create or replace function public.ai_hub_create_signup_membership(p_user auth.users)
returns void
language plpgsql
security definer
set search_path = public, core, ai_hub
as $$
declare
  v_meta jsonb := coalesce(p_user.raw_user_meta_data, '{}'::jsonb);
  v_project uuid := core.ai_hub_project_id();
  v_admin boolean := v_meta->>'app_role' = 'admin';
  v_name text := coalesce(nullif(btrim(v_meta->>'display_name'), ''), split_part(coalesce(p_user.email, ''), '@', 1), 'User');
begin
  if v_project is null or coalesce(v_meta->>'login_id', '') = '' then
    return;
  end if;

  insert into core.profiles (user_id, email, display_name, updated_at)
  values (p_user.id, coalesce(p_user.email, ''), v_name, now())
  on conflict (user_id) do nothing;

  insert into core.project_memberships (project_id, user_id, role, status)
  values (v_project, p_user.id, case when v_admin then 'admin' else 'user' end, 'pending')
  on conflict on constraint project_memberships_pkey do nothing;

  if v_admin then
    insert into ai_hub.admin_profiles (user_id, organization, updated_at)
    values (p_user.id, coalesce(nullif(btrim(v_meta->>'organization'), ''), 'Unspecified'), now())
    on conflict (user_id) do nothing;
  end if;
end
$$;

create or replace function public.ai_hub_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public, core, ai_hub
as $$
begin
  begin
    perform public.ai_hub_create_signup_membership(new);
  exception when others then
    raise warning 'ai_hub signup membership skipped for %: %', new.id, sqlerrm;
  end;
  return new;
end
$$;

drop trigger if exists ai_hub_signup_membership on auth.users;
create trigger ai_hub_signup_membership
  after insert on auth.users
  for each row execute function public.ai_hub_on_auth_user_created();

-- Backfill: earlier email/ID signups that never logged in after confirming.
do $$
declare
  v_user auth.users;
begin
  for v_user in
    select u.* from auth.users u
     where coalesce(u.raw_user_meta_data->>'login_id', '') <> ''
       and not exists (select 1 from core.project_memberships m
                        where m.project_id = core.ai_hub_project_id() and m.user_id = u.id)
  loop
    perform public.ai_hub_create_signup_membership(v_user);
  end loop;
end
$$;

-- Member list also says whether the email address is confirmed (login needs it).
create or replace function public.ai_hub_list_members_v3()
returns jsonb
language sql stable security definer
set search_path = public, core, ai_hub
as $$
  select coalesce(jsonb_agg(member.value || jsonb_build_object(
    'organization', coalesce(nullif(u.raw_user_meta_data->>'headquarters', ''), member.value->>'organization'),
    'department', u.raw_user_meta_data->>'department',
    'contact_phone', u.raw_user_meta_data->>'contact_phone',
    'email_confirmed', u.email_confirmed_at is not null
  ) order by member.ordinality), '[]'::jsonb)
  from jsonb_array_elements(public.ai_hub_list_members_v2()) with ordinality as member(value, ordinality)
  join auth.users u on u.id::text = member.value->>'user_id'
  where core.is_ai_hub_admin();
$$;
revoke all on function public.ai_hub_list_members_v3() from public, anon;
grant execute on function public.ai_hub_list_members_v3() to authenticated;

revoke all on function public.ai_hub_create_signup_membership(auth.users) from public, anon, authenticated;
revoke all on function public.ai_hub_on_auth_user_created() from public, anon, authenticated;

notify pgrst, 'reload schema';
