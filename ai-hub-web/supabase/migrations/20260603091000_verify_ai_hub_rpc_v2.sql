select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'ai_hub_get_session_v2',
    'ai_hub_ensure_membership_v2',
    'ai_hub_list_members_v2',
    'ai_hub_update_member_v2'
  )
order by p.proname;

notify pgrst, 'reload schema';
