import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getExternalAppReturnTo,
  readGoogleLoginReturnTo,
  rememberGoogleLoginReturnTo,
} from '../src/auth/googleLoginReturnTo.ts'

test('keeps external-studio path, query and hash across a Google login round trip', () => {
  assert.equal(getExternalAppReturnTo('/another-studio/?title=%ED%95%9C%EA%B8%80#step-6'), '/another-studio/?title=%ED%95%9C%EA%B8%80#step-6')
  assert.equal(getExternalAppReturnTo('/external-studio/'), '/external-studio/')
  assert.equal(getExternalAppReturnTo('/external-studio/?project=story#step-8'), '/external-studio/?project=story#step-8')
  assert.equal(getExternalAppReturnTo('/external-studio'), '/external-studio')
})

test('keeps OAuth return state in the same tab briefly without changing the registered callback URL', () => {
  let entry = null
  const storage = {
    getItem: () => entry,
    setItem: (_key, value) => { entry = value },
    removeItem: () => { entry = null },
  }
  rememberGoogleLoginReturnTo('/external-studio/?project=story', storage, 1_000)
  assert.equal(readGoogleLoginReturnTo(storage, 2_000), '/external-studio/?project=story')
  assert.equal(readGoogleLoginReturnTo(storage, 1_000 + 15 * 60 * 1000 + 1), null)
  assert.equal(entry, null)
  assert.doesNotThrow(() => rememberGoogleLoginReturnTo('/user/marketplace', storage, 3_000))
  assert.equal(readGoogleLoginReturnTo(storage, 3_000), null)
})

test('rejects external, unrelated and traversal return destinations', () => {
  for (const destination of [
    null,
    '',
    '/',
    '/user/marketplace',
    '//attacker.example/external-studio/',
    'https://attacker.example/external-studio/',
    '/external-studio/../user/marketplace',
    '/external-studio%2F..%2Fuser',
    '/external-studio\\..\\user',
  ]) {
    assert.equal(getExternalAppReturnTo(destination), null)
  }
})

test('portal pages and old Google return state never become external-app redirects', () => {
  for (const page of ['dashboard', 'installed-apps', 'marketplace', 'modules', 'settings', 'app-registry', 'users', 'notifications', 'io-log', 'login', 'signup/google', 'reset-password', 'pair', 'asset/example', 'inventory']) {
    for (const suffix of ['', '?project=retained#step-2']) assert.equal(getExternalAppReturnTo('/' + page + suffix), null)
  }
  assert.equal(getExternalAppReturnTo('/Dashboard'), null)
  let entry = JSON.stringify({returnTo:'/dashboard',savedAt:1_000})
  const storage = {getItem:()=>entry,setItem:(_key,value)=>{entry=value},removeItem:()=>{entry=null}}
  assert.equal(readGoogleLoginReturnTo(storage,2_000), null)
  assert.equal(entry, null)
  rememberGoogleLoginReturnTo('/another-studio/?project=old#step-6',storage,3_000)
  assert.equal(readGoogleLoginReturnTo(storage,4_000), '/another-studio/?project=old#step-6')
})
