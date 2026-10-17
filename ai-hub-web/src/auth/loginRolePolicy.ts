import type { UserRole } from './types'

/** ACAP shares the user login entry point for both approved account roles. */
export function canLoginWithRole(
  selectedRole: UserRole,
  accountRole: UserRole,
  externalReturnTo: string | null,
): boolean {
  if (selectedRole === accountRole) return true
  return selectedRole === 'user' && accountRole === 'admin'
    && !!externalReturnTo && /^\/ACAP(?:\/|[?#]|$)/.test(externalReturnTo)
}
