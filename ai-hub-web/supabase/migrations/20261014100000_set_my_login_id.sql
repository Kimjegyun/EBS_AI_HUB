-- A signed-in user sets (or changes) their own login ID.
--
-- Google signups have no user_metadata.login_id, so they could only use Google
-- sign-in. With a login ID plus a password (set with supabase.auth.updateUser),
-- they can also sign in on the ID/password form: ai_hub_resolve_login_email_v1
-- looks the ID up in user_metadata.login_id. The ID is checked for format and
-- uniqueness here, under a lock, so two accounts cannot claim the same ID.
create or replace function public.ai_hub_set_my_login_id_v1(p_login_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_login_id text := lower(trim(coalesce(p_login_id, '')));
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if v_login_id !~ '^[a-z0-9._-]{3,32}$' then
    raise exception '아이디는 영문 소문자, 숫자, 점, 밑줄, 하이픈으로 3~32자만 사용할 수 있습니다.';
  end if;

  perform pg_advisory_xact_lock(hashtext('ai_hub_login_id:' || v_login_id));

  if exists (
    select 1 from auth.users
     where id <> v_uid
       and lower(coalesce(raw_user_meta_data ->> 'login_id', '')) = v_login_id
  ) then
    raise exception '이미 사용 중인 아이디입니다.';
  end if;

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('login_id', v_login_id),
         updated_at = now()
   where id = v_uid;

  return v_login_id;
end
$$;

revoke all on function public.ai_hub_set_my_login_id_v1(text) from public, anon;
grant execute on function public.ai_hub_set_my_login_id_v1(text) to authenticated;

notify pgrst, 'reload schema';
