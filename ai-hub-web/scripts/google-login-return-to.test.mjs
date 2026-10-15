import { expect, test } from 'bun:test'
import {
  getExternalAppReturnTo,
  readGoogleLoginReturnTo,
  rememberGoogleLoginReturnTo,
} from '../src/auth/googleLoginReturnTo.ts'

test('keeps external-studio path, query and hash across a Google login round trip', () => {
  expect(getExternalAppReturnTo('/another-studio/?title=%ED%95%9C%EA%B8%80#step-6')).toBe('/another-studio/?title=%ED%95%9C%EA%B8%80#step-6')
  expect(getExternalAppReturnTo('/external-studio/')).toBe('/external-studio/')
  expect(getExternalAppReturnTo('/external-studio/?project=story#step-8')).toBe('/external-studio/?project=story#step-8')
  expect(getExternalAppReturnTo('/external-studio')).toBe('/external-studio')
})

test('keeps OAuth return state in the same tab briefly without changing the registered callback URL', () => {
  let entry = null
  const storage = {
    getItem: () => entry,
    setItem: (_key, value) => { entry = value },
    removeItem: () => { entry = null },
  }
  rememberGoogleLoginReturnTo('/external-studio/?project=story', storage, 1_000)
  expect(readGoogleLoginReturnTo(storage, 2_000)).toBe('/external-studio/?project=story')
  expect(readGoogleLoginReturnTo(storage, 1_000 + 15 * 60 * 1000 + 1)).toBeNull()
  expect(entry).toBeNull()
  expect(() => rememberGoogleLoginReturnTo('/user/marketplace', storage, 3_000)).not.toThrow()
  expect(readGoogleLoginReturnTo(storage, 3_000)).toBeNull()
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
    expect(getExternalAppReturnTo(destination)).toBeNull()
  }
})
