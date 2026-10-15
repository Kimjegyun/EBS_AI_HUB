import test from 'node:test'
import assert from 'node:assert/strict'
import { profileError, readGoogleProfile } from '../src/auth/googleProfile.ts'
const complete = { headquarters: 'HQ', department: 'AI', name: 'User', phone: '010-1234-5678' }
test('each of the four Google signup fields is required', () => {
  for (const key of Object.keys(complete)) assert.ok(profileError({ ...complete, [key]: '  ' }))
  assert.equal(profileError(complete), null)
})
test('contact accepts formatted phones and rejects invalid input', () => {
  for (const phone of ['abc01012345678', '010', '1234567890123456']) assert.ok(profileError({ ...complete, phone }))
  assert.equal(profileError({ ...complete, phone: '+82 10 1234 5678' }), null)
})
test('Google identity name alone does not complete employment profile', () => {
  assert.ok(profileError(readGoogleProfile({ full_name: 'Google Name' })))
  assert.deepEqual(readGoogleProfile({ headquarters: 'HQ', department: 'AI', display_name: 'User', contact_phone: '010-1234-5678' }), complete)
})
