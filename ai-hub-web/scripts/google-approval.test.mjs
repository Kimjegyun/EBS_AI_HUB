import test from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('Google signup waits for approval and preserves existing membership states', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema core; create schema ai_hub;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function core.ai_hub_project_id() returns uuid language sql as $$ select '10000000-0000-4000-8000-000000000001'::uuid $$;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb, raw_app_meta_data jsonb);
      create table auth.identities(user_id uuid, provider_id text, provider text, identity_data jsonb);
      create table core.profiles(user_id uuid primary key, email text, display_name text);
      create table core.project_memberships(project_id uuid, user_id uuid, role text, status text, approved_at timestamptz, primary key(project_id,user_id));
      create function public.ai_hub_get_session_v2() returns jsonb language sql as $$
        select jsonb_build_object('role',m.role,'status',m.status,'display_name',p.display_name)
        from core.project_memberships m join core.profiles p using(user_id) where m.user_id=auth.uid()
      $$;
    `)
    await db.exec(readFileSync(new URL('../supabase/migrations/20261021090000_require_google_membership_approval.sql', import.meta.url), 'utf8'))
    await db.exec(readFileSync(new URL('./test-google-direct-login.sql', import.meta.url), 'utf8'))
  } finally { await db.close() }
})
