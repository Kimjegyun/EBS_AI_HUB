import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function loadModule(file, dependencies = {}) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  new Function('require', 'exports', source)(name => {
    if (!(name in dependencies)) throw Error(`Unexpected dependency: ${name}`)
    return dependencies[name]
  }, exports)
  return exports
}

test('Google first login requests missing profile and restores saved account details', async () => {
  const user = { id: 'account-1', identities: [{ provider: 'google' }], user_metadata: {} }
  let status = 'approved'
  const supabase = {
    rpc: async () => ({ data: { user_id: user.id, email: 'test@example.invalid', role: 'user', status }, error: null }),
    auth: { getUser: async () => ({ data: { user }, error: null }) },
  }
  const api = loadModule('../src/auth/supabaseMembership.ts', {
    '../lib/supabase': { supabase },
    '../lib/withTimeout': { withTimeout: promise => promise },
    './googleProfile': loadModule('../src/auth/googleProfile.ts'),
  })
  assert.equal((await api.loginWithGoogleMembership()).needsGoogleProfile, true)
  assert.equal((await api.loginWithGoogleMembership()).needsGoogleProfile, true, 'unsaved profile must prompt again on the next login')
  user.user_metadata = { headquarters: '본부', department: '부서', contact_phone: '010-1234-5678', unrelated: 'preserved' }
  for (const key of ['headquarters', 'department', 'contact_phone']) {
    const saved = user.user_metadata[key]
    user.user_metadata[key] = '   '
    assert.equal((await api.loginWithGoogleMembership()).needsGoogleProfile, true, `missing ${key} must prompt`)
    user.user_metadata[key] = saved
  }
  const restored = await api.getAiHubSession()
  assert.equal(restored.needsGoogleProfile, false)
  assert.equal(restored.organization, '본부')
  assert.equal(restored.department, '부서')
  assert.equal(restored.contactPhone, '010-1234-5678')
  status = 'pending'
  assert.equal((await api.loginWithGoogleMembership()).status, 'pending')
  status = 'rejected'
  assert.equal((await api.loginWithGoogleMembership()).status, 'rejected')
  user.identities = [{ provider: 'email' }]
  user.user_metadata = {}
  assert.equal((await api.getAiHubSession()).needsGoogleProfile, false)
})
