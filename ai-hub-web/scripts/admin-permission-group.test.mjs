import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('ADMIN group migration executes and preserves permission boundaries', async (t) => {
  const db = new PGlite()
  const admin = '00000000-0000-4000-8000-000000000001'
  const owner = '00000000-0000-4000-8000-000000000002'
  const user = '00000000-0000-4000-8000-000000000003'
  const independentAdmin = '00000000-0000-4000-8000-000000000004'
  const actor = id => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  const role = async id => (await db.query('select role from core.project_memberships where user_id=$1', [id])).rows[0].role
  const assign = (id, group) => db.query('select public.ai_hub_set_user_api_group_v1($1, $2)', [id, group])
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema core; create schema ai_hub;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function core.ai_hub_project_id() returns uuid language sql immutable as $$ select '10000000-0000-4000-8000-000000000001'::uuid $$;
      create table core.project_memberships(project_id uuid not null default core.ai_hub_project_id(), user_id uuid primary key, role text not null);
      create function core.is_ai_hub_admin() returns boolean language sql stable as $$ select exists(select 1 from core.project_memberships where user_id=auth.uid() and project_id=core.ai_hub_project_id() and role in ('admin','owner')) $$;
      create table ai_hub.api_usage_groups(group_id text primary key, group_name text not null, monthly_limit integer);
      create table ai_hub.user_api_usage(user_id uuid primary key, period text, group_id text references ai_hub.api_usage_groups(group_id), updated_at timestamptz, updated_by uuid);
    `)
    for (const [id, memberRole] of [[admin, 'admin'], [owner, 'owner'], [user, 'user'], [independentAdmin, 'admin']]) {
      await db.query('insert into core.project_memberships(user_id,role) values($1,$2)', [id, memberRole])
    }
    await db.exec(readFileSync(new URL('../supabase/migrations/20261016090000_admin_permission_group.sql', import.meta.url), 'utf8'))
    await actor(admin)
    await t.test('direct role appointment and removal', async () => {
      await db.query("select public.ai_hub_set_member_role_v1($1,'admin')", [user])
      assert.equal(await role(user), 'admin')
      await db.query("select public.ai_hub_set_member_role_v1($1,'user')", [user])
      assert.equal(await role(user), 'user')
    })
    await t.test('group grant, same-group retry, old RPC bypass, and revocation', async () => {
      await assign(user, 'ADMIN'); await assign(user, 'ADMIN')
      assert.equal(await role(user), 'admin')
      await assert.rejects(db.query("select public.ai_hub_set_member_role_v1($1,'user')", [user]), /ADMIN 그룹/)
      await assert.rejects(db.query("update core.project_memberships set role='user' where user_id=$1", [user]), /ADMIN 그룹/)
      await assign(user, null)
      assert.equal(await role(user), 'user')
    })
    await t.test('independently appointed admin survives group removal', async () => {
      await assign(independentAdmin, 'ADMIN'); await assign(independentAdmin, '')
      assert.equal(await role(independentAdmin), 'admin')
    })
    await t.test('self, OWNER, and unauthorized user protection', async () => {
      await assert.rejects(assign(admin, 'ADMIN'), /본인/)
      await assert.rejects(assign(owner, 'ADMIN'), /OWNER/)
      await assert.rejects(db.query("select public.ai_hub_set_member_role_v1($1,'user')", [admin]), /본인/)
      await assert.rejects(db.query("select public.ai_hub_set_member_role_v1($1,'user')", [owner]), /OWNER/)
      await actor(user)
      await assert.rejects(assign(independentAdmin, 'ADMIN'), /Admin permission/)
      await assert.rejects(db.query("select public.ai_hub_set_member_role_v1($1,'admin')", [user]), /Admin permission/)
      await actor(admin)
    })
    await t.test('reserved ADMIN group stays protected while ordinary groups can be deleted', async () => {
      await assert.rejects(db.query("delete from ai_hub.api_usage_groups where group_id='ADMIN'"), /ADMIN/)
      await assert.rejects(db.query("update ai_hub.api_usage_groups set group_name='renamed' where group_id='ADMIN'"), /ADMIN/)
      await assert.rejects(db.query("insert into ai_hub.api_usage_groups values('other',' admin ',10)"), /예약/)
      await db.query("insert into ai_hub.api_usage_groups values('temporary','Temporary',10)")
      await db.query("delete from ai_hub.api_usage_groups where group_id='temporary'")
      assert.equal((await db.query("select count(*)::integer as count from ai_hub.api_usage_groups where group_id='temporary'")).rows[0].count, 0)
    })
    await t.test('role RPC is denied to anonymous clients', async () => {
      const { rows } = await db.query("select has_function_privilege('anon','public.ai_hub_set_member_role_v1(uuid,text)','execute') as anon, has_function_privilege('authenticated','public.ai_hub_set_member_role_v1(uuid,text)','execute') as authenticated")
      assert.deepEqual(rows[0], { anon: false, authenticated: true })
    })
  } finally { await db.close() }
})
