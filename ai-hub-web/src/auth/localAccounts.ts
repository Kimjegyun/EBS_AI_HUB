import type { AuthSession, UserRole } from './types'
import {
  decryptLocalAccountsPayload,
  encryptLocalAccountsPlaintext,
  isEncryptedPayload,
} from './localAccountsCrypto'

const STORAGE_KEY = 'ai-hub-local-accounts-v1'

type StoredAccount = {
  emailNorm: string
  loginIdNorm?: string
  passwordHash: string
  role: UserRole
  displayName: string
  organization: string | null
}

function normEmail(email: string) {
  return email.trim().toLowerCase()
}

function normLoginId(loginId: string) {
  return loginId.trim().toLowerCase()
}

async function hashPassword(password: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      '비밀번호 처리를 위해 Web Crypto가 필요합니다. HTTPS 또는 localhost에서 다시 시도해 주세요.',
    )
  }
  const buf = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function normalizeRows(parsed: unknown): StoredAccount[] {
  if (!Array.isArray(parsed)) return []
  return parsed.filter(
    (row): row is StoredAccount =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as StoredAccount).emailNorm === 'string' &&
      typeof (row as StoredAccount).passwordHash === 'string' &&
      ((row as StoredAccount).role === 'admin' || (row as StoredAccount).role === 'user'),
  )
}

async function readStore(): Promise<StoredAccount[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      const rows = normalizeRows(parsed)
      await writeStore(rows)
      return rows
    }
    if (isEncryptedPayload(parsed)) {
      const plain = await decryptLocalAccountsPayload(raw)
      if (!plain) return []
      const inner = JSON.parse(plain) as unknown
      return normalizeRows(inner)
    }
  } catch {
    return []
  }
  return []
}

async function writeStore(rows: StoredAccount[]) {
  const plain = JSON.stringify(rows)
  const enc = await encryptLocalAccountsPlaintext(plain)
  localStorage.setItem(STORAGE_KEY, enc)
}

export async function registerLocalAccount(params: {
  email: string
  loginId?: string
  password: string
  role: UserRole
  displayName: string
  organization: string | null
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const emailNorm = normEmail(params.email)
    if (!emailNorm) {
      return { ok: false, message: '이메일을 입력해 주세요.' }
    }
    const loginIdNorm = params.loginId ? normLoginId(params.loginId) : emailNorm
    const rows = await readStore()
    if (rows.some((r) => r.emailNorm === emailNorm)) {
      return { ok: false, message: '이미 등록된 이메일입니다.' }
    }
    if (rows.some((r) => (r.loginIdNorm ?? r.emailNorm) === loginIdNorm)) {
      return { ok: false, message: '이미 등록된 아이디입니다.' }
    }
    const passwordHash = await hashPassword(params.password)
    rows.push({
      emailNorm,
      loginIdNorm,
      passwordHash,
      role: params.role,
      displayName: params.displayName,
      organization: params.role === 'admin' ? params.organization : null,
    })
    await writeStore(rows)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.'
    return { ok: false, message: msg }
  }
}

export async function authenticateLocal(params: {
  loginId: string
  password: string
}): Promise<AuthSession | null> {
  try {
    const loginIdNorm = normLoginId(params.loginId)
    const rows = await readStore()
    const row = rows.find((r) => (r.loginIdNorm ?? r.emailNorm) === loginIdNorm)
    if (!row) return null
    const hash = await hashPassword(params.password)
    if (hash !== row.passwordHash) return null
    return {
      role: row.role,
      email: row.emailNorm,
      displayName: row.displayName,
      organization: row.organization,
    }
  } catch {
    return null
  }
}
