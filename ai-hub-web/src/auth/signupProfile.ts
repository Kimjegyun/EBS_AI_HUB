import type { User } from '@supabase/supabase-js'
import type { UserRole } from './types'

export type SignupProfile = {
  displayName: string
  organization: string | null
  requestedRole: UserRole
}

export function getSignupProfileFromUser(user: User, fallbackRole: UserRole): SignupProfile {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const email = user.email ?? ''
  const requestedRole: UserRole = meta.app_role === 'admin' ? 'admin' : fallbackRole
  const displayName =
    typeof meta.display_name === 'string' && meta.display_name.trim()
      ? meta.display_name.trim()
      : email.split('@')[0] || 'User'
  const organization =
    typeof meta.organization === 'string' && meta.organization.trim()
      ? meta.organization.trim()
      : null

  return {
    displayName,
    organization: requestedRole === 'admin' ? organization : null,
    requestedRole,
  }
}
