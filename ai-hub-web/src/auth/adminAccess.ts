import { getLocalApiBaseUrl } from '../lib/localApi'
import { supabase } from '../lib/supabase'

export const ADMIN_UI_SESSION_KEY = 'ai-hub-admin-ui-revealed'

async function verifyViaLocalServer(code: string): Promise<boolean> {
  const res = await fetch(`${getLocalApiBaseUrl()}/api/auth/verify-admin-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!res.ok) return false
  const payload = (await res.json().catch(() => null)) as { ok?: unknown } | null
  return payload?.ok === true
}

export async function verifyAdminAccessCode(code: string): Promise<boolean> {
  const trimmed = code.trim()
  if (!trimmed) return false

  if (supabase) {
    const { data, error } = await supabase.functions.invoke('verify-admin-gate', {
      body: { code: trimmed },
    })
    if (error) return false
    return Boolean(data && typeof data === 'object' && (data as { ok?: unknown }).ok === true)
  }

  try {
    return await verifyViaLocalServer(trimmed)
  } catch {
    return false
  }
}
