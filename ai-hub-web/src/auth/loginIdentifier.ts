import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'

const LOGIN_ID_TIMEOUT_MS = 10_000

type RpcResult<T> = {
  data: T
  error: { message: string } | null
}

function throwRpcSetupError(error: { message: string }) {
  if (error.message.includes('schema cache') || error.message.includes('Could not find the function')) {
    throw new Error(
      'Supabase에 아이디 로그인 RPC가 아직 적용되지 않았습니다. SQL Editor에서 20260605090000_ai_hub_complete_auth_setup.sql을 실행한 뒤 다시 로그인해 주세요.',
    )
  }
  throw new Error(error.message)
}

export function normalizeLoginId(value: string) {
  return value.trim().toLowerCase()
}

export async function resolveLoginEmail(loginId: string): Promise<string | null> {
  if (!supabase) return null
  const normalized = normalizeLoginId(loginId)
  if (!normalized) return null

  const { data, error } = await withTimeout<RpcResult<unknown>>(
    Promise.resolve(
      supabase.rpc('ai_hub_resolve_login_email_v1', {
        p_login_id: normalized,
      }) as unknown as RpcResult<unknown>,
    ),
    LOGIN_ID_TIMEOUT_MS,
    '아이디 확인이 지연되고 있습니다. Supabase RPC 설정을 확인해 주세요.',
  )

  if (error) throwRpcSetupError(error)
  return typeof data === 'string' && data ? data : null
}

export async function isLoginIdAvailable(loginId: string): Promise<boolean> {
  if (!supabase) return true
  const normalized = normalizeLoginId(loginId)
  if (!normalized) return false

  const { data, error } = await withTimeout<RpcResult<unknown>>(
    Promise.resolve(
      supabase.rpc('ai_hub_is_login_id_available_v1', {
        p_login_id: normalized,
      }) as unknown as RpcResult<unknown>,
    ),
    LOGIN_ID_TIMEOUT_MS,
    '아이디 중복 확인이 지연되고 있습니다.',
  )

  if (error) throwRpcSetupError(error)
  return data === true
}
