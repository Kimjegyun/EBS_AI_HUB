import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import { normalizeLoginId, resolveLoginEmail } from './loginIdentifier'

const RESET_EMAIL_TIMEOUT_MS = 20_000

/** user_metadata flag set by an admin reset; cleared when the user picks their own password. */
export const PASSWORD_RESET_REQUIRED_KEY = 'password_reset_required'

export const RESET_PASSWORD_PATH = 'reset-password'

export function isPasswordChangeRequired(user: User | null | undefined): boolean {
  return user?.user_metadata?.[PASSWORD_RESET_REQUIRED_KEY] === true
}

export function isOnResetPasswordPage(): boolean {
  return window.location.pathname.replace(/\/+$/, '').endsWith(`/${RESET_PASSWORD_PATH}`)
}

/** The reset link returns to this portal's reset page (must be in Supabase Auth → Redirect URLs). */
function resetRedirectUrl(): string {
  return new URL(`${import.meta.env.BASE_URL}${RESET_PASSWORD_PATH}`, window.location.origin).href
}

/** Sends the Supabase password reset email to the account's address. */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  if (!supabase) throw new Error('Supabase 연결 설정이 필요합니다.')
  const { error } = await withTimeout(
    supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: resetRedirectUrl() }),
    RESET_EMAIL_TIMEOUT_MS,
    '재설정 메일 요청이 시간 초과되었습니다. 네트워크와 Supabase 설정을 확인해 주세요.',
  )
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('rate limit') || error.status === 429) {
      throw new Error('메일 발송 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.')
    }
    throw new Error(error.message)
  }
}

/**
 * Self-service "비밀번호 찾기": the 아이디 and 가입 이메일 must belong to the same account
 * before the reset link is sent to that email.
 */
export async function requestPasswordReset(loginId: string, email: string): Promise<'sent' | 'mismatch'> {
  const normalizedId = normalizeLoginId(loginId)
  const emailTrim = email.trim().toLowerCase()
  const accountEmail = await resolveLoginEmail(normalizedId)
  if (!accountEmail || accountEmail.trim().toLowerCase() !== emailTrim) return 'mismatch'
  await sendPasswordResetEmail(accountEmail)
  return 'sent'
}

/**
 * Sets the signed-in user's password (also gives Google signups a password) and clears
 * the admin-reset mark. Supabase may ask for a code sent to the account email first
 * ("Secure password change"); then this returns 'reauth' and the caller retries with the code.
 */
export async function updateMyPassword(password: string, nonce?: string): Promise<'done' | 'reauth'> {
  if (!supabase) throw new Error('Supabase 연결 설정이 필요합니다.')
  const { error } = await supabase.auth.updateUser({
    password,
    ...(nonce ? { nonce: nonce.trim() } : {}),
    data: { [PASSWORD_RESET_REQUIRED_KEY]: null },
  })
  if (!error) return 'done'
  if (error.code === 'reauthentication_needed' || /reauthenticat/i.test(error.message)) {
    const { error: reErr } = await supabase.auth.reauthenticate()
    if (reErr) throw new Error(reErr.message)
    return 'reauth'
  }
  if (error.code === 'same_password') throw new Error('지금 쓰는 비밀번호와 다른 비밀번호를 입력해 주세요.')
  if (error.code === 'weak_password') throw new Error('비밀번호가 너무 약합니다. 더 길게, 문자와 숫자를 섞어 입력해 주세요.')
  if (error.code === 'reauthentication_not_valid') throw new Error('확인 코드가 올바르지 않거나 만료되었습니다.')
  throw new Error(error.message)
}

/** Sets the signed-in user's login ID (ai_hub_set_my_login_id_v1) and returns the saved ID. */
export async function setMyLoginId(loginId: string): Promise<string> {
  if (!supabase) throw new Error('Supabase 연결 설정이 필요합니다.')
  const { data, error } = await supabase.rpc('ai_hub_set_my_login_id_v1', { p_login_id: normalizeLoginId(loginId) })
  if (error && (error.message.includes('schema cache') || error.message.includes('Could not find the function'))) {
    throw new Error('아이디 설정 기능이 Supabase에 아직 설치되지 않았습니다. SQL Editor에서 20261014100000_set_my_login_id.sql을 실행해 주세요.')
  }
  if (error) throw new Error(error.message)
  // The ID is written server-side; refresh so the local user metadata shows it.
  await supabase.auth.refreshSession().catch(() => undefined)
  return typeof data === 'string' ? data : normalizeLoginId(loginId)
}

/** 12-character temporary password without look-alike characters (0/O, 1/l/I). */
export function generateTemporaryPassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint32Array(length))
  let out = ''
  for (const b of bytes) out += chars[b % chars.length]
  // Guarantee at least one digit so the password reads as a password, not a word.
  return /\d/.test(out) ? out : `${out.slice(0, -1)}${2 + (bytes[0] % 8)}`
}
