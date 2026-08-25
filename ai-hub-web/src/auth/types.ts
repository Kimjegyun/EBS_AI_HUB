export type UserRole = 'admin' | 'user'
export type MembershipStatus = 'pending' | 'approved' | 'rejected'

export type AuthSession = {
  userId?: string
  projectId?: string
  role: UserRole
  projectRole?: 'owner' | 'admin' | 'user'
  status?: MembershipStatus
  email: string
  displayName: string
  organization: string | null
}
