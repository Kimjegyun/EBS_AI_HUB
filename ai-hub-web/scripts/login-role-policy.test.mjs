import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canLoginWithRole } from '../src/auth/loginRolePolicy.ts'

test('retired ACAP return targets do not bypass the selected login role', () => {
  for (const target of ['/ACAP', '/ACAP/', '/ACAP/?project=one#step-3', '/ACAP?project=one']) {
    assert.equal(canLoginWithRole('user', 'admin', target), false)
    assert.equal(canLoginWithRole('user', 'user', target), true)
  }
})

test('any approved account can use the user portal while admin tools remain protected', () => {
  for (const target of [null, '/', '/settings', '/ACAP-other/', '/another-studio/']) {
    assert.equal(canLoginWithRole('user', 'admin', target), true)
    assert.equal(canLoginWithRole('user', 'user', target), true)
  }
  assert.equal(canLoginWithRole('user', 'admin', 'https://example.com/ACAP/'), false)
  assert.equal(canLoginWithRole('admin', 'user', '/ACAP/'), false)
  assert.equal(canLoginWithRole('admin', 'admin', '/ACAP/'), true)
  assert.equal(canLoginWithRole('user', 'user', null), true)
})
