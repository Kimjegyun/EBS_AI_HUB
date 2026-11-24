import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { gatewaySecurity } from './gatewaySecurity.mjs'

const require = createRequire(new URL('../server/package.json', import.meta.url))
test('retired public credentials fail; individual Supabase identity requires current matching approval', async () => {
  const before = { ...process.env }, oldFetch = globalThis.fetch
  Object.assign(process.env, { JWT_SECRET: 'test-only-auth-secret', INVENTORY_ACCESS_CODE: 'retired-field-test', SUPABASE_URL: 'https://identity.example', SUPABASE_ANON_KEY: 'anon-test' })
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL('../server/src/middleware/auth.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function('require', 'exports', code)((name) => name === 'jsonwebtoken' ? require(name) : name.includes('timingSafe') ? { secretsEqual: (a, b) => a === b } : { get: async () => null }, exports)
  let status = 'approved', role = 'admin', id = 'member-1', calls = 0
  globalThis.fetch = async (url, options) => {
    calls++
    assert.equal(options.redirect, 'error')
    return Response.json(String(url).includes('/auth/') ? { id: 'member-1', email: 'member@example.test' } : { user_id: id, status, role })
  }
  const invoke = async (token) => {
    let next = false
    const req = { headers: { authorization: `Bearer ${token}` } }
    const res = { code: 200, status(n) { this.code = n; return this }, json() { return this } }
    await exports.authenticate(req, res, () => { next = true })
    return { req, res, next }
  }
  try {
    assert.equal((await invoke('retired-field-test')).res.code, 401)
    assert.equal(calls, 0)
    assert.equal((await invoke('individual-supabase-test')).req.user.role, 'admin')
    role = 'user'
    assert.equal((await invoke('individual-supabase-test')).req.user.role, 'user')
    status = 'rejected'
    assert.equal((await invoke('individual-supabase-test')).next, false)
    status = 'approved'; id = 'different-user'
    assert.equal((await invoke('individual-supabase-test')).next, false)
  } finally { globalThis.fetch = oldFetch; for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key]; Object.assign(process.env, before) }
})

test('gateway applies security headers and discards spoofed forwarding chains', () => {
  const headers = {}
  const res = { setHeader: (name, value) => { headers[name] = value } }
  const req = { socket: { remoteAddress: '127.0.0.1' }, headers: { 'cf-connecting-ip': '203.0.113.23', 'x-forwarded-for': 'attacker', forwarded: 'spoofed' } }
  gatewaySecurity(req, res, () => {})
  assert.equal(req.headers['x-forwarded-for'], '203.0.113.23')
  assert.equal(req.headers.forwarded, undefined)
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'self'/)
  assert.equal(headers['X-Content-Type-Options'], 'nosniff')
  const lan = { socket: { remoteAddress: '192.168.0.12' }, headers: { 'cf-connecting-ip': '203.0.113.23' } }
  gatewaySecurity(lan, res, () => {})
  assert.equal(lan.headers['x-forwarded-for'], '192.168.0.12')
})

test('media-src must allow saved local movies without opening arbitrary remote media', () => {
  const headers = {};
  gatewaySecurity({socket:{remoteAddress:'127.0.0.1'},headers:{}},{setHeader:(name,value)=>{headers[name]=value;}},()=>{});
  const directives = Object.fromEntries(headers['Content-Security-Policy'].split(';').map(value=>value.trim().split(/\s+/)).filter(value=>value[0]).map(([name,...sources])=>[name,sources]));
  assert.deepEqual(directives['media-src'], ["'self'", 'blob:']);
  assert.deepEqual(directives['default-src'], ["'self'"]);
  assert.equal(directives['connect-src'].includes('data:'), false);
  assert.equal(directives['media-src'].includes('*'), false);
});

test('configured Cloudflare beacon uses one exact script origin while arbitrary scripts stay blocked', () => {
  const headers = {};
  gatewaySecurity({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }, { setHeader: (name, value) => { headers[name] = value; } }, () => {});
  const scripts = headers['Content-Security-Policy'].split(';').map(value => value.trim()).find(value => value.startsWith('script-src ')).split(/\s+/).slice(1);
  assert.deepEqual(scripts, ["'self'", 'blob:', "'wasm-unsafe-eval'", 'https://static.cloudflareinsights.com']);
  for (const forbidden of ['*', 'https:', "'unsafe-eval'", "'unsafe-inline'", 'data:']) assert.equal(scripts.includes(forbidden), false);
});
