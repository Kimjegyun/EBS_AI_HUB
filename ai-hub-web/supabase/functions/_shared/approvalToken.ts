import { timingSafeEqualBytes } from './timingSafe.ts'

const TOKEN_TTL_MS = 48 * 60 * 60 * 1000
const FORBIDDEN_SECRETS = new Set(['', 'default-secret-change-in-production', 'default-secret'])

function getApprovalSecret(): string {
  const secret = Deno.env.get('APPROVAL_TOKEN_SECRET')?.trim() ?? ''
  if (FORBIDDEN_SECRETS.has(secret)) {
    throw new Error('APPROVAL_TOKEN_SECRET is not configured')
  }
  return secret
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((value.length % 4) || 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return new Uint8Array(signature)
}

export async function createApprovalToken(userId: string, action: 'approve' | 'reject'): Promise<string> {
  const secret = getApprovalSecret()
  const payload = `${userId}:${action}:${Date.now() + TOKEN_TTL_MS}`
  const payloadBytes = new TextEncoder().encode(payload)
  const signature = await hmacSha256(secret, payload)
  return `${toBase64Url(payloadBytes)}.${toBase64Url(signature)}`
}

export async function verifyApprovalToken(
  token: string,
  userId: string,
  action: 'approve' | 'reject',
): Promise<boolean> {
  try {
    const secret = getApprovalSecret()
    const [payloadPart, signaturePart] = token.split('.')
    if (!payloadPart || !signaturePart) return false

    const payload = new TextDecoder().decode(fromBase64Url(payloadPart))
    const expectedSig = await hmacSha256(secret, payload)
    const providedSig = fromBase64Url(signaturePart)
    if (!timingSafeEqualBytes(expectedSig, providedSig)) {
      return false
    }

    const [tokenUserId, tokenAction, expRaw] = payload.split(':')
    if (tokenUserId !== userId || tokenAction !== action) return false
    const expiresAt = Number(expRaw)
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false
    return true
  } catch {
    return false
  }
}
