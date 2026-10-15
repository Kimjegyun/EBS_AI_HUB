-- Run after the migration inside a transaction that is always rolled back.
do $$
declare
  u uuid := gen_random_uuid();
  p uuid := core.ai_hub_project_id();
  s jsonb;
  r text;
  st text;
begin
  insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data)
    values(u, u::text || '@example.invalid', now(), '{}'::jsonb, '{}'::jsonb);
  perform set_config('request.jwt.claim.sub', u::text, true);
  begin
    perform public.ai_hub_google_login();
    raise exception 'TEST: non-Google identity accepted';
  exception when others then
    if sqlerrm <> 'Google authentication is required.' then raise; end if;
  end;
  insert into auth.identities(user_id, provider_id, provider, identity_data)
    values(u, u::text, 'google', jsonb_build_object('sub', u::text));
  delete from core.project_memberships where user_id = u;
  s := public.ai_hub_google_login();
  if s->>'role' <> 'user' or s->>'status' <> 'approved' then raise exception 'New user login failed'; end if;
  update core.profiles set display_name = 'Preserved name' where user_id = u;
  foreach r in array array['user','admin','owner'] loop
    foreach st in array array['pending','approved','rejected'] loop
      update core.project_memberships set role = r, status = st where user_id = u and project_id = p;
      s := public.ai_hub_google_login();
      if s->>'role' <> r or s->>'status' <> (case when r = 'user' and st = 'pending' then 'approved' else st end)
        or s->>'display_name' <> 'Preserved name' then
        raise exception 'Role, status or profile changed unexpectedly: %, %', r, st;
      end if;
    end loop;
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.ai_hub_google_login();
    raise exception 'TEST: anonymous accepted';
  exception when others then
    if sqlerrm <> 'Google authentication is required.' then raise; end if;
  end;
  if has_function_privilege('anon', 'public.ai_hub_google_login()', 'execute') then raise exception 'Anonymous RPC permission'; end if;
end $$;
select 'PASS: new and pending Google users; existing roles, rejection and profile preserved; anonymous/non-Google denied' as result;
