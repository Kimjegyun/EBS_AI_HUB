/**
 * AES-256-GCM 대칭 암/복호화 유틸
 *
 * 암호화 형식 (Base64): <12바이트 IV>:<16바이트 AuthTag>:<암호문>
 * 키 원천: ENCRYPTION_KEY 환경변수 (hex 64자 = 32바이트)
 *
 * 주의: 같은 ENCRYPTION_KEY가 있어야 복호화 가능.
 * ENCRYPTION_KEY가 없으면 암호화/복호화 모두 TypeError를 던집니다.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

// 암호화된 값 prefix — 평문과 구분하기 위해 사용
export const ENC_PREFIX = 'enc:v1:'

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY?.trim()
  if (!raw) throw new TypeError('ENCRYPTION_KEY is not set')

  // hex 64자(32바이트) 또는 임의 길이 문자열 모두 허용
  // hex 64자면 그대로 사용, 아니면 scrypt로 32바이트 파생
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  // 임의 길이 문자열 → scrypt(salt="aihub", 32바이트)
  return scryptSync(raw, 'aihub-encryption-salt', 32)
}

/** 문자열을 AES-256-GCM으로 암호화. 결과: "enc:v1:<base64>" */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12) // GCM 표준 IV 크기
  const cipher = createCipheriv('aes-256-gcm', key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  // 형식: iv(12) + tag(16) + ciphertext → base64
  const payload = Buffer.concat([iv, tag, encrypted]).toString('base64')
  return `${ENC_PREFIX}${payload}`
}

/** "enc:v1:..." 형식의 암호문을 복호화. 일반 문자열이면 그대로 반환. */
export function decrypt(value: string): string {
  if (!value.startsWith(ENC_PREFIX)) return value // 평문은 그대로

  const key = getKey()
  const payload = Buffer.from(value.slice(ENC_PREFIX.length), 'base64')

  const iv = payload.subarray(0, 12)
  const tag = payload.subarray(12, 28)
  const ciphertext = payload.subarray(28)

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

/** 값이 암호화된 상태인지 확인 */
export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX)
}
