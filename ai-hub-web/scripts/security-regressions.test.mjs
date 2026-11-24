import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { EventEmitter } from 'node:events'
import { isIP } from 'node:net'

const serverRequire = createRequire(new URL('../server/package.json', import.meta.url))
function load(file, dependencies = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  new Function('require', 'exports', code)(name => {
    if (!(name in dependencies)) throw Error(`Unexpected dependency ${name}`)
    return dependencies[name]
  }, exports)
  return exports
}
function response() {
  return { statusCode: 200, status(n) { this.statusCode = n; return this }, json(body) { this.body = body; return this } }
}

test('local JWT cannot preserve revoked approval or obsolete administrator privileges', async () => {
  const jwt = serverRequire('jsonwebtoken')
  const old = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-only-secret-with-enough-entropy-for-this-test'
  let user = { id: 'u1', email: 'test@example.invalid', role: 'user', status: 'approved' }
  const { authenticate } = load('../server/src/middleware/auth.ts', {
    jsonwebtoken: jwt, '../lib/timingSafe': { secretsEqual: (a, b) => a === b },
    '../config/database': { get: async () => user },
  })
  try {
    const token = jwt.sign({ id: 'u1', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: 60 })
    let next = false
    const req = { headers: { authorization: `Bearer ${token}` } }
    await authenticate(req, response(), () => { next = true })
    assert.equal(next, true)
    assert.equal(req.user.role, 'user')
    for (const current of [{ ...user, status: 'rejected' }, null]) {
      user = current; next = false
      const res = response()
      await authenticate(req, res, () => { next = true })
      assert.equal(next, false)
      assert.equal(res.statusCode, 401)
    }
    const res = response()
    await authenticate({ headers: { authorization: `Basic ${token}` } }, res, () => assert.fail('Bad scheme accepted'))
    assert.equal(res.statusCode, 401)
  } finally { if (old === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = old }
})

test('settings API checks current approval and administrator portal access', async () => {
  const routes = {}
  const router = { get: (path, handler) => { routes.get = handler }, put: (path, handler) => { routes.put = handler } }
  let status = 'pending', role = 'user', reads = 0
  const oldFetch = globalThis.fetch
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_ANON_KEY
  process.env.SUPABASE_URL = 'https://example.invalid'; process.env.SUPABASE_ANON_KEY = 'test'
  globalThis.fetch = async url => ({ ok: true, json: async () => String(url).includes('/auth/')
    ? { id: 'u1' } : { user_id: 'u1', status, role } })
  load('../server/src/routes/userSettings.routes.ts', {
    express: { Router: () => router },
    '../config/database': { all: async () => { reads++; return [] }, run: async () => {} },
  })
  try {
    const req = portal => ({ params: { portal }, headers: { authorization: 'Bearer test' } })
    let res = response()
    await routes.get(req('user'), res, error => { throw error })
    assert.equal(res.statusCode, 401); assert.equal(reads, 0)
    status = 'approved'
    res = response(); await routes.get(req('admin'), res, error => { throw error })
    assert.equal(res.statusCode, 401); assert.equal(reads, 0)
    role = 'admin'
    res = response(); await routes.get(req('admin'), res, error => { throw error })
    assert.equal(res.statusCode, 200); assert.equal(reads, 1)
    status = 'rejected'
    res = response(); await routes.get(req('admin'), res, error => { throw error })
    assert.equal(res.statusCode, 401); assert.equal(reads, 1, 'revocation must not be bypassed by cached authentication')
  } finally {
    globalThis.fetch = oldFetch
    for (const [key, value] of [['SUPABASE_URL', oldUrl], ['SUPABASE_ANON_KEY', oldKey]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  }
})

test('provider credentials cannot follow redirects and requests have a deadline', async () => {
  const original = globalThis.fetch
  let options
  globalThis.fetch = async (_url, init) => { options = init; return new Response('{}') }
  try {
    const { providerFetch } = load('../server/src/lib/providerFetch.ts')
    await providerFetch('https://provider.example/v1', { redirect: 'follow', headers: { Authorization: 'Bearer synthetic' } })
    assert.equal(options.redirect, 'error'); assert.ok(options.signal)
    await assert.rejects(providerFetch('https://user:password@provider.example/v1'))
    await assert.rejects(providerFetch('file:///etc/passwd'))
  } finally { globalThis.fetch = original }
})

test('in-flight settings from account A cannot be applied after switching to B', async () => {
  const saved = { fetch: globalThis.fetch, localStorage: globalThis.localStorage, window: globalThis.window }
  let id = 'A', resolveFetch
  const storage = new Map()
  globalThis.localStorage = { get length() { return storage.size }, key: i => [...storage.keys()][i],
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
  globalThis.window = { dispatchEvent: () => {} }
  globalThis.fetch = () => new Promise(resolve => { resolveFetch = resolve })
  try {
    const { syncAccountSettings } = load('../src/lib/settingsSync.ts', {
      './localApi': { getLocalApiBaseUrl: () => '' }, './portalStorage': { getPortalMode: () => 'user' },
      './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic', user: { id } } } }) } } },
      './userScopedStorage': { getCurrentAuthSession: () => ({ userId: id }), onUserScopedChange: () => {}, userScopedStorageKey: key => `${id}:${key}` },
    })
    const pending = syncAccountSettings()
    await new Promise(resolve => setImmediate(resolve))
    assert.ok(resolveFetch)
    id = 'B'
    resolveFetch({ ok: true, json: async () => ({ settings: { notes: { value: 'private account A', updatedAt: new Date().toISOString() } } }) })
    assert.deepEqual(await pending, [])
    assert.equal(storage.size, 0)
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value
    }
  }
})

test('web excerpts reject private DNS answers and pin public addresses without redirects', async () => {
  let addresses = [{ address: '127.0.0.1', family: 4 }], options, status = 200, calls = 0
  function request(_url, init, callback) {
    calls++; options = init
    const req = new EventEmitter()
    req.destroy = error => { req.emit('error', error); req.emit('close') }
    req.end = () => {
      const res = new EventEmitter()
      res.statusCode = status; res.resume = () => {}
      callback(res)
      if (status === 200) { res.emit('data', Buffer.from('<p>public</p>')); res.emit('end') }
      req.emit('close')
    }
    return req
  }
  const { fetchPublicHtml, isPublicIpv4 } = load('../server/src/lib/publicPageFetch.ts', {
    'dns/promises': { lookup: async () => addresses }, http: { request }, https: { request }, net: { isIP },
  })
  for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '::1']) {
    assert.equal(isPublicIpv4(ip), false)
  }
  await assert.rejects(fetchPublicHtml('https://attacker.example/'))
  assert.equal(calls, 0)
  addresses = [{ address: '8.8.8.8', family: 4 }]
  assert.equal(await fetchPublicHtml('https://public.example/'), '<p>public</p>')
  options.lookup('public.example', {}, (_error, ip) => assert.equal(ip, '8.8.8.8'))
  status = 302
  await assert.rejects(fetchPublicHtml('https://public.example/'))
  assert.equal(calls, 2, 'redirect must not trigger another request')
})

test('encryption failure never falls back to saving a plaintext API key', async () => {
  let writes = 0
  const { writeEnvironmentData } = load('../server/src/lib/environmentStore.ts', {
    '../config/database': { get: async () => undefined, run: async () => { writes++ } },
    './secretFields': load('../server/src/lib/secretFields.ts'),
    './crypto': { encrypt: () => { throw Error('ENCRYPTION_KEY is not set') }, decrypt: value => value },
  })
  await assert.rejects(writeEnvironmentData({ ai_openai_api_key: 'synthetic-api-key' }), /ENCRYPTION_KEY/)
  await assert.rejects(writeEnvironmentData({ ai_app_settings: { app: { ai_fal_api_key: 'synthetic-api-key' } } }), /ENCRYPTION_KEY/)
  assert.equal(writes, 0)
})

test('user management waits for persistence and reports database failures', async () => {
  let finish
  class UserService {
    getUsers() { return new Promise(resolve => { finish = resolve }) }
    async approveUser() { throw Error('database unavailable') }
  }
  const { UserController } = load('../server/src/controllers/user.controller.ts', {
    '../services/user.service': { UserService },
  })
  const controller = new UserController()
  const res = response()
  const pending = controller.getUsers({}, res)
  assert.equal(res.body, undefined)
  finish([{ id: 'u1' }]); await pending
  assert.deepEqual(res.body, [{ id: 'u1' }])
  const failed = response()
  await controller.approveUser({ params: { id: 'u1' } }, failed)
  assert.equal(failed.statusCode, 500)
  assert.deepEqual(failed.body, { error: 'Internal Server Error' })
})
