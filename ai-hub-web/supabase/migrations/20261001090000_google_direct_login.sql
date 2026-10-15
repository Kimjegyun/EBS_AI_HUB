create or replace function public.ai_hub_google_login()
returns jsonb language plpgsql security definer
set search_path = public, core, ai_hub
as $$
declare
  v_user uuid := auth.uid();
  v_project uuid := core.ai_hub_project_id();
  v_email text;
  v_name text;
begin
  if v_user is null or not exists (
    select 1 from auth.identities i where i.user_id = v_user and i.provider = 'google'
  ) then raise exception 'Google authentication is required.'; end if;
  select u.email, coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(u.raw_user_meta_data->>'name'), ''), split_part(u.email, '@', 1))
    into v_email, v_name from auth.users u where u.id = v_user and u.email_confirmed_at is not null;
  if v_email is null or v_project is null then
    raise exception 'Verified Google account and AI HUB project are required.';
  end if;
  insert into core.profiles(user_id, email, display_name)
    values(v_user, v_email, coalesce(v_name, 'User')) on conflict (user_id) do nothing;
  insert into core.project_memberships(project_id, user_id, role, status, approved_at)
    values(v_project, v_user, 'user', 'approved', now())
    on conflict (project_id, user_id) do update set status = 'approved', approved_at = now()
      where core.project_memberships.role = 'user' and core.project_memberships.status = 'pending';
  -- Preserve existing admins, rejected accounts, and stored profile information.
  return public.ai_hub_get_session_v2();
end
$$;
revoke all on function public.ai_hub_google_login() from public, anon;
grant execute on function public.ai_hub_google_login() to authenticated;
