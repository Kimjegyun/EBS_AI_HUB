import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canLoginWithRole } from '../src/auth/loginRolePolicy.ts'

test('ACAP user login accepts admin credentials without changing the account role', () => {
  for (const target of ['/ACAP', '/ACAP/', '/ACAP/?project=one#step-3', '/ACAP?project=one']) {
    assert.equal(canLoginWithRole('user', 'admin', target), true)
    assert.equal(canLoginWithRole('user', 'user', target), true)
  }
})

test('other entry points keep their role restrictions', () => {
  for (const target of [null, '/', '/settings', '/ACAP-other/', '/another-studio/', 'https://example.com/ACAP/']) {
    assert.equal(canLoginWithRole('user', 'admin', target), false)
  }
  assert.equal(canLoginWithRole('admin', 'user', '/ACAP/'), false)
  assert.equal(canLoginWithRole('admin', 'admin', '/ACAP/'), true)
  assert.equal(canLoginWithRole('user', 'user', null), true)
})
