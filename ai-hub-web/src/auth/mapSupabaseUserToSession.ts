import type { User } from '@supabase/supabase-js'
import type { AuthSession, UserRole } from './types'
import { mapUserMetadataToPendingSession } from './supabaseMembership'

export function mapSupabaseUserToSession(user: User): AuthSession {
  if (user.id) {
    return mapUserMetadataToPendingSession(user)
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const role: UserRole = meta.app_role === 'admin' ? 'admin' : 'user'
  const email = user.email ?? ''
  const displayName =
    typeof meta.display_name === 'string' && meta.display_name.trim()
      ? meta.display_name.trim()
      : email.split('@')[0] || '사용자'
  const orgRaw =
    typeof meta.organization === 'string' ? meta.organization.trim() : ''
  return {
    role,
    email,
    displayName,
    organization: role === 'admin' ? (orgRaw || null) : null,
  }
}
