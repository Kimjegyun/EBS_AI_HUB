create or replace function public.ai_hub_list_members_v3()
returns jsonb
language sql stable security definer
set search_path = public, core, ai_hub
as $$
  select coalesce(jsonb_agg(member.value || jsonb_build_object(
    'organization', coalesce(nullif(u.raw_user_meta_data->>'headquarters', ''), member.value->>'organization'),
    'department', u.raw_user_meta_data->>'department',
    'contact_phone', u.raw_user_meta_data->>'contact_phone'
  ) order by member.ordinality), '[]'::jsonb)
  from jsonb_array_elements(public.ai_hub_list_members_v2()) with ordinality as member(value, ordinality)
  join auth.users u on u.id::text = member.value->>'user_id'
  where core.is_ai_hub_admin();
$$;
revoke all on function public.ai_hub_list_members_v3() from public, anon;
grant execute on function public.ai_hub_list_members_v3() to authenticated;
