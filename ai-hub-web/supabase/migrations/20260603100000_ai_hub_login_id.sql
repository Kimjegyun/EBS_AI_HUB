create or replace function public.ai_hub_resolve_login_email_v1(p_login_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select au.email
  from auth.users as au
  where lower(coalesce(au.raw_user_meta_data ->> 'login_id', '')) = lower(trim(p_login_id))
  order by au.created_at asc
  limit 1
$$;

create or replace function public.ai_hub_is_login_id_available_v1(p_login_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from auth.users as au
    where lower(coalesce(au.raw_user_meta_data ->> 'login_id', '')) = lower(trim(p_login_id))
  )
$$;

grant execute on function public.ai_hub_resolve_login_email_v1(text) to anon, authenticated;
grant execute on function public.ai_hub_is_login_id_available_v1(text) to anon, authenticated;

notify pgrst, 'reload schema';
