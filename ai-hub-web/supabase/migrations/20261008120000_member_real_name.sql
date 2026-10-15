-- 성명 (real name) per member, managed by admins.
--
-- Display names are often an English short form (login ID style, e.g. "kjg"), which
-- is hard to recognise in the admin list. The Korean full name is kept separately in
-- auth user metadata (real_name) so the display name stays as the user chose it.

-- Edit: v1 plus p_real_name. v1 stays for older clients.
create or replace function public.ai_hub_update_member_profile_v2(
  p_user_id uuid,
  p_display_name text,
  p_real_name text,
  p_organization text,
  p_department text,
  p_contact_phone text,
  p_role text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, core, ai_hub
as $$
begin
  -- Permission, self-protection, owner rules and all other fields: same as v1.
  perform public.ai_hub_update_member_profile_v1(
    p_user_id, p_display_name, p_organization, p_department, p_contact_phone, p_role, p_status);

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object('real_name', left(btrim(coalesce(p_real_name, '')), 30))
   where id = p_user_id;
end
$$;

revoke all on function public.ai_hub_update_member_profile_v2(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.ai_hub_update_member_profile_v2(uuid, text, text, text, text, text, text, text) to authenticated;

-- Member list: adds real_name (keeps email_confirmed from 20261008100000).
create or replace function public.ai_hub_list_members_v3()
returns jsonb
language sql stable security definer
set search_path = public, core, ai_hub
as $$
  select coalesce(jsonb_agg(member.value || jsonb_build_object(
    'organization', coalesce(nullif(u.raw_user_meta_data->>'headquarters', ''), member.value->>'organization'),
    'department', u.raw_user_meta_data->>'department',
    'contact_phone', u.raw_user_meta_data->>'contact_phone',
    'real_name', nullif(u.raw_user_meta_data->>'real_name', ''),
    'email_confirmed', u.email_confirmed_at is not null
  ) order by member.ordinality), '[]'::jsonb)
  from jsonb_array_elements(public.ai_hub_list_members_v2()) with ordinality as member(value, ordinality)
  join auth.users u on u.id::text = member.value->>'user_id'
  where core.is_ai_hub_admin();
$$;
revoke all on function public.ai_hub_list_members_v3() from public, anon;
grant execute on function public.ai_hub_list_members_v3() to authenticated;

notify pgrst, 'reload schema';
