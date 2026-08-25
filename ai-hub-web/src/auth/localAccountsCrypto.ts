/**
 * 로컬 계정 목록(JSON)을 브라우저 로컬 저장소에 둘 때 AES-GCM으로 암호화합니다.
 * 복호화 키는 `VITE_LOCAL_STORAGE_SECRET`(권장) 또는 개발용 난수+출처 기반 문자열에서 유도합니다.
 */

const encoder = new TextEncoder()

function toBase64(u8: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!)
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function getSecretMaterial(): string {
  const fromEnv = import.meta.env.VITE_LOCAL_STORAGE_SECRET
  if (typeof fromEnv === 'string' && fromEnv.trim().length >= 8) {
    return fromEnv.trim()
  }
  const origin =
    typeof globalThis.location !== 'undefined' ? globalThis.location.origin : 'unknown-origin'
  const devId = getOrCreateDevDeviceId()
  return `ai-hub-dev-weak|${origin}|${devId}`
}

const DEV_ID_KEY = 'ai-hub-local-device-id'

function getOrCreateDevDeviceId(): string {
  try {
    let id = localStorage.getItem(DEV_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(DEV_ID_KEY, id)
    }
    return id
  } catch {
    return 'no-storage'
  }
}

async function getAesGcmKey(): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      '이 브라우저에서는 Web Crypto(API)를 쓸 수 없습니다. HTTPS 또는 localhost에서 열어 주세요.',
    )
  }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(getSecretMaterial()),
  )
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

export type LocalAccountsEncPayload = {
  v: 2
  iv: string
  ciphertext: string
}

export function isEncryptedPayload(parsed: unknown): parsed is LocalAccountsEncPayload {
  if (!parsed || typeof parsed !== 'object') return false
  const o = parsed as LocalAccountsEncPayload
  return o.v === 2 && typeof o.iv === 'string' && typeof o.ciphertext === 'string'
}

export async function encryptLocalAccountsPlaintext(plainUtf8: string): Promise<string> {
  const key = await getAesGcmKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(plainUtf8),
    ),
  )
  const payload: LocalAccountsEncPayload = {
    v: 2,
    iv: toBase64(iv),
    ciphertext: toBase64(ct),
  }
  return JSON.stringify(payload)
}

export async function decryptLocalAccountsPayload(
  jsonString: string,
): Promise<string | null> {
  try {
    const parsed = JSON.parse(jsonString) as unknown
    if (!isEncryptedPayload(parsed)) return null
    const key = await getAesGcmKey()
    const iv = fromBase64(parsed.iv)
    const ct = fromBase64(parsed.ciphertext)
    const buf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      new Uint8Array(ct),
    )
    return new TextDecoder().decode(buf)
  } catch {
    return null
  }
}
