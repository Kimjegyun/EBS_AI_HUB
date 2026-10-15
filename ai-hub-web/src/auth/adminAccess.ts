import { getLocalApiBaseUrl } from '../lib/localApi'
import { supabase } from '../lib/supabase'
import { setPortalScopedItem, setPortalScopedSessionItem } from '../lib/portalStorage'

export const ADMIN_UI_SESSION_KEY = 'ai-hub-admin-ui-revealed'

async function verifyViaLocalServer(code: string): Promise<boolean> {
  const res = await fetch(`${getLocalApiBaseUrl()}/api/auth/verify-admin-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!res.ok) return false
  const payload = (await res.json().catch(() => null)) as { ok?: unknown } | null
  const valid = payload?.ok === true
  if (valid) {
    setPortalScopedSessionItem('api-admin-token', code)
    // Also persisted: the Supabase login survives closing the tab or PWA, and without
    // this the admin screen fell back to the field token (403 on admin-only APIs).
    // Cleared on logout (AuthContext).
    setPortalScopedItem('api-admin-token', code)
  }
  return valid
}

export async function verifyAdminAccessCode(code: string): Promise<boolean> {
  const trimmed = code.trim()
  if (!trimmed) return false

  if (supabase) {
    const { data, error } = await supabase.functions.invoke('verify-admin-gate', {
      body: { code: trimmed },
    })
    if (error) return false
    const valid = Boolean(data && typeof data === 'object' && (data as { ok?: unknown }).ok === true)
    if (valid) await verifyViaLocalServer(trimmed).catch(() => false)
    return valid
  }

  try {
    return await verifyViaLocalServer(trimmed)
  } catch {
    return false
  }
}
