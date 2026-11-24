import type { UserRole } from './types'

/** All approved accounts can use the user portal; admin tools stay admin-only. */
export function canLoginWithRole(
  selectedRole: UserRole,
  accountRole: UserRole,
  externalReturnTo: string | null,
): boolean {
  if (selectedRole === 'admin') return accountRole === 'admin'
  if (accountRole === 'user') return true

  // An admin may use the user portal, but a retired ACAP return URL must not
  // turn that login into a path around the discontinued app entry point.
  if (externalReturnTo) {
    try {
      const pathname = new URL(externalReturnTo, 'https://ebs-aihub.com').pathname
      if (/^\/ACAP(?:\/|$)/i.test(pathname)) return false
    } catch {
      return false
    }
  }
  return true
}
