import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import type { AuthSession, MembershipStatus, UserRole } from './types'
import { readGoogleProfile } from './googleProfile'

const AI_HUB_RPC_TIMEOUT_MS = 15_000

export type AiHubMember = {
  /** ?깅챸 (Korean full name) kept by admins when the display name is an English short form. */
  realName?: string | null
  /** False until the user clicks the email confirmation link (email/ID signups). */
  emailConfirmed?: boolean
  department?: string | null
  contactPhone?: string | null
  userId: string
  email: string
  displayName: string
  organization: string | null
  role: 'owner' | 'admin' | 'user'
  status: MembershipStatus
  createdAt: string
  approvedAt: string | null
}

type SessionRow = {
  user_id?: string
  project_id?: string
  email?: string
  display_name?: string
  organization?: string | null
  role?: 'owner' | 'admin' | 'user'
  status?: MembershipStatus
}

type MemberRow = SessionRow & {
  real_name?: string | null
  email_confirmed?: boolean
  department?: string | null
  contact_phone?: string | null
  created_at?: string
  approved_at?: string | null
}

type RpcResult<T> = {
  data: T
  error: { message: string } | null
}

type ApprovalRpcResult = { status?: string; changed?: boolean }
export type MemberApprovalOutcome = 'approved' | 'already-approved' | 'approved-notification-warning' | 'already-approved-notification-warning' | null

function throwRpcSetupError(error: { message: string }) {
  if (error.message.includes('schema cache') || error.message.includes('Could not find the function')) {
    throw new Error(
      'Supabase AI HUB ?몄쬆 RPC媛 ?꾩쭅 ?곸슜?섏? ?딆븯?듬땲?? SQL Editor?먯꽌 20260605090000_ai_hub_complete_auth_setup.sql???ㅽ뻾??二쇱꽭??',
    )
  }
  throw new Error(error.message)
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function firstRpcObject(data: unknown): SessionRow | null {
  if (Array.isArray(data)) {
    return data.length > 0 ? (asObject(data[0]) as SessionRow | null) : null
  }
  return asObject(data) as SessionRow | null
}

function rpcArray(data: unknown): MemberRow[] {
  if (Array.isArray(data)) return data.filter(asObject) as MemberRow[]
  return []
}

function roleToUserRole(role: SessionRow['role']): UserRole {
  return role === 'owner' || role === 'admin' ? 'admin' : 'user'
}

export function mapUserMetadataToPendingSession(user: User): AuthSession {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const email = user.email ?? ''
  const displayName =
    typeof meta.display_name === 'string' && meta.display_name.trim()
      ? meta.display_name.trim()
      : email.split('@')[0] || 'User'
  const requestedRole = meta.app_role === 'admin' ? 'admin' : 'user'
  const organization =
    typeof meta.organization === 'string' && meta.organization.trim()
      ? meta.organization.trim()
      : null

  return {
    userId: user.id,
    role: requestedRole,
    projectRole: requestedRole,
    status: 'pending',
    email,
    displayName,
    organization: requestedRole === 'admin' ? organization : null,
  }
}

function mapSessionRow(row: SessionRow): AuthSession | null {
  if (!row.email || !row.role || !row.status) return null
  return {
    userId: row.user_id,
    projectId: row.project_id,
    role: roleToUserRole(row.role),
    projectRole: row.role,
    status: row.status,
    email: row.email,
    displayName: row.display_name || row.email.split('@')[0] || 'User',
    organization: row.organization ?? null,
  }
}

function mapMemberRow(row: MemberRow): AiHubMember | null {
  if (!row.user_id || !row.email || !row.role || !row.status) return null
  return {
    realName: row.real_name ?? null,
    emailConfirmed: row.email_confirmed,
    department: row.department,
    contactPhone: row.contact_phone,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name || row.email.split('@')[0] || 'User',
    organization: row.organization ?? null,
    role: row.role,
    status: row.status,
    createdAt: row.created_at ?? '',
    approvedAt: row.approved_at ?? null,
  }
}

export async function getAiHubSession(): Promise<AuthSession | null> {
  if (!supabase) return null
  const { data, error } = await withTimeout<RpcResult<unknown>>(
    Promise.resolve(supabase.rpc('ai_hub_get_session_v2') as unknown as RpcResult<unknown>),
    AI_HUB_RPC_TIMEOUT_MS,
    'AI HUB ?몄뀡 議고쉶媛 吏?곕릺怨??덉뒿?덈떎. Supabase RPC ?⑥닔? ?ㅽ듃?뚰겕 ?곹깭瑜??뺤씤??二쇱꽭??',
  )
  if (error) throwRpcSetupError(error)
  const row = firstRpcObject(data)
  const session = row ? mapSessionRow(row) : null
  if (!session) return null
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) throw new Error('?ъ슜???뺣낫瑜??뺤씤?섏? 紐삵뻽?듬땲?? ?ㅼ떆 濡쒓렇?명빐 二쇱꽭??')
  const profile = readGoogleProfile(user.user_metadata ?? {})
  // Membership and approval come from the server. Older accounts may lack
  // Google signup profile fields; that must not turn them into new members.
  return { ...session, organization: profile.headquarters || session.organization,
    department: profile.department || undefined, contactPhone: profile.phone || undefined,
    needsGoogleProfile: (user.app_metadata?.provider === 'google' ||
      (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes('google')) ||
      !!user.identities?.some(identity => identity.provider === 'google')) &&
      ![profile.headquarters, profile.department, profile.phone].every(value => value.trim()) }
}

export async function loginWithGoogleMembership(): Promise<AuthSession | null> {
  if (!supabase) return null
  const { data, error } = await withTimeout<RpcResult<unknown>>(
    Promise.resolve(supabase.rpc('ai_hub_google_login') as unknown as RpcResult<unknown>),
    AI_HUB_RPC_TIMEOUT_MS,
    'Google 濡쒓렇?몄씠 吏?곕릺怨??덉뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄??二쇱꽭??',
  )
  if (error) throw new Error(error.message)
  const row = firstRpcObject(data)
  return row ? getAiHubSession() : null
}

export async function ensureAiHubMembership(params: {
  displayName: string
  organization: string | null
  requestedRole: UserRole
}): Promise<AuthSession | null> {
  if (!supabase) return null
  const { data, error } = await withTimeout<RpcResult<unknown>>(
    Promise.resolve(supabase.rpc('ai_hub_ensure_membership_v2', {
      p_display_name: params.displayName,
      p_organization: params.organization,
      p_requested_role: params.requestedRole,
    }) as unknown as RpcResult<unknown>),
    AI_HUB_RPC_TIMEOUT_MS,
    'AI HUB 硫ㅻ쾭???앹꽦??吏?곕릺怨??덉뒿?덈떎. Supabase SQL Editor?먯꽌 v2 RPC媛 ?앹꽦?먮뒗吏 ?뺤씤??二쇱꽭??',
  )
  if (error) throwRpcSetupError(error)
  const row = firstRpcObject(data)
  return row ? mapSessionRow(row) : null
}

export async function listAiHubMembers(): Promise<AiHubMember[]> {
  if (!supabase) return []
  const { data, error } = await withTimeout<RpcResult<unknown>>(
    Promise.resolve(supabase.rpc('ai_hub_list_members_v3') as unknown as RpcResult<unknown>),
    AI_HUB_RPC_TIMEOUT_MS,
    'AI HUB ?ъ슜??紐⑸줉 議고쉶媛 吏?곕릺怨??덉뒿?덈떎. Supabase RPC ?⑥닔? 沅뚰븳 ?뺤콉???뺤씤??二쇱꽭??',
  )
  if (error) throwRpcSetupError(error)
  return rpcArray(data)
    .map(mapMemberRow)
    .filter((row): row is AiHubMember => row !== null)
}

/**
 * Admin delete (ai_hub_delete_member_v1): removes the AI HUB membership, and the
 * login account too when the user belongs to no other project. Returns whether the
 * account itself was deleted.
 */
export async function deleteAiHubMember(userId: string): Promise<{ accountDeleted: boolean }> {
  if (!supabase) throw new Error('Supabase ?곌껐 ?ㅼ젙???꾩슂?⑸땲??')
  const { data, error } = await withTimeout<RpcResult<unknown>>(
    Promise.resolve(supabase.rpc('ai_hub_delete_member_v1', { p_user_id: userId }) as unknown as RpcResult<unknown>),
    AI_HUB_RPC_TIMEOUT_MS,
    'AI HUB ?ъ슜????젣媛 吏?곕릺怨??덉뒿?덈떎. Supabase ?곌껐???뺤씤??二쇱꽭??',
  )
  if (error && (error.message.includes('schema cache') || error.message.includes('Could not find the function'))) {
    throw new Error('?ъ슜????젣 湲곕뒫??Supabase???꾩쭅 ?ㅼ튂?섏? ?딆븯?듬땲?? SQL Editor?먯꽌 20261008110000_admin_delete_member.sql???ㅽ뻾??二쇱꽭??')
  }
  if (error) throwRpcSetupError(error)
  return { accountDeleted: asObject(data)?.account_deleted === true }
}

/** Admin sets a temporary password; the user must change it at next sign-in (ai_hub_admin_reset_member_password_v1). */
export async function resetAiHubMemberPassword(userId: string, temporaryPassword: string): Promise<void> {
  if (!supabase) throw new Error('Supabase ?곌껐 ?ㅼ젙???꾩슂?⑸땲??')
  const { error } = await withTimeout<RpcResult<unknown>>(
    Promise.resolve(supabase.rpc('ai_hub_admin_reset_member_password_v1', {
      p_user_id: userId,
      p_new_password: temporaryPassword,
    }) as unknown as RpcResult<unknown>),
    AI_HUB_RPC_TIMEOUT_MS,
    '鍮꾨?踰덊샇 珥덇린?붽? 吏?곕릺怨??덉뒿?덈떎. Supabase ?곌껐???뺤씤??二쇱꽭??',
  )
  if (error && (error.message.includes('schema cache') || error.message.includes('Could not find the function'))) {
    throw new Error('鍮꾨?踰덊샇 珥덇린??湲곕뒫??Supabase???꾩쭅 ?ㅼ튂?섏? ?딆븯?듬땲?? SQL Editor?먯꽌 20261014090000_admin_reset_member_password.sql???ㅽ뻾??二쇱꽭??')
  }
  if (error) throwRpcSetupError(error)
}

/** Admin edit of member profile and access, including atomic approval transitions. */
export async function updateAiHubMemberProfile(params: {
  userId: string
  displayName: string
  realName: string
  organization: string
  department: string
  contactPhone: string
  role: 'owner' | 'admin' | 'user'
  status: MembershipStatus
}): Promise<MemberApprovalOutcome> {
  if (!supabase) throw new Error('Supabase ?곌껐 ?ㅼ젙???꾩슂?⑸땲??')
  const { data, error } = await withTimeout<RpcResult<ApprovalRpcResult>>(
    Promise.resolve(supabase.rpc('ai_hub_update_member_profile_v3', {
      p_user_id: params.userId,
      p_display_name: params.displayName,
      p_real_name: params.realName,
      p_organization: params.organization,
      p_department: params.department,
      p_contact_phone: params.contactPhone,
      p_role: params.role,
      p_status: params.status,
    }) as unknown as RpcResult<ApprovalRpcResult>),
    AI_HUB_RPC_TIMEOUT_MS,
    'AI HUB ?ъ슜???뺣낫 ??μ씠 吏?곕릺怨??덉뒿?덈떎. Supabase ?곌껐???뺤씤??二쇱꽭??',
  )
  if (error && (error.message.includes('schema cache') || error.message.includes('Could not find the function'))) {
    throw new Error('?ъ슜???뱀씤 ?뚮┝ 湲곕뒫??Supabase???꾩쭅 ?ㅼ튂?섏? ?딆븯?듬땲?? SQL Editor?먯꽌 20261118100000_admin_signup_approval_notifications.sql???ㅽ뻾??二쇱꽭??')
  }
  if (error) throwRpcSetupError(error)
  if (params.status !== 'approved') return null
  const transitioned = data?.changed === true
  const notificationsSent = await notifyApprovalEvents(params.userId, transitioned)
  if (transitioned) return notificationsSent ? 'approved' : 'approved-notification-warning'
  if (data?.status === 'approved') return notificationsSent ? 'already-approved' : 'already-approved-notification-warning'
  return null
}

async function sendMembershipApprovalEmail(userId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.functions.invoke('notify-member-approved', { body: { user_id: userId } })
  if (error) throw new Error(`?뱀씤? ??ν뻽吏留?媛?낆옄 硫붿씪??蹂대궡吏 紐삵뻽?듬땲?? ${error.message}`)
}

async function sendAdminApprovalNotification(userId: string): Promise<void> {
  if (!supabase) return
  const { data, error } = await supabase.functions.invoke('notify-admin-member-approved', { body: { user_id: userId } })
  if (error || data?.sent === false) {
    throw new Error(error?.message ?? data?.error ?? '愿由ъ옄 ?뱀씤 ?꾨즺 ?뚮┝??蹂대궡吏 紐삵뻽?듬땲??')
  }
}

async function notifyApprovalEvents(userId: string, sendMemberMail: boolean): Promise<boolean> {
  const notifications: Array<Promise<void>> = [sendAdminApprovalNotification(userId)]
  if (sendMemberMail) notifications.push(sendMembershipApprovalEmail(userId))
  const results = await Promise.allSettled(notifications)
  const failures = results.flatMap((result) => result.status === 'rejected'
    ? [result.reason instanceof Error ? result.reason.message : '硫붿씪 諛쒖넚???ㅽ뙣?덉뒿?덈떎.']
    : [])
  return failures.length === 0
}

export async function updateAiHubMember(params: {
  userId: string
  status: MembershipStatus
  role: 'owner' | 'admin' | 'user'
}): Promise<MemberApprovalOutcome> {
  if (!supabase) return null
  if (params.status === 'approved') {
    const { data, error } = await withTimeout<RpcResult<ApprovalRpcResult>>(
      Promise.resolve(supabase.rpc('ai_hub_approve_member_v1', {
        p_user_id: params.userId,
        p_role: params.role,
      }) as unknown as RpcResult<ApprovalRpcResult>),
      AI_HUB_RPC_TIMEOUT_MS,
      'AI HUB ?ъ슜???뱀씤 泥섎━媛 吏?곕릺怨??덉뒿?덈떎. ?곌껐???뺤씤??二쇱꽭??',
    )
    if (error && (error.message.includes('schema cache') || error.message.includes('Could not find the function'))) {
      throw new Error('?먯옄???뱀씤 湲곕뒫??Supabase???ㅼ튂?섏? ?딆븯?듬땲?? SQL Editor?먯꽌 20261118100000_admin_signup_approval_notifications.sql???ㅽ뻾??二쇱꽭??')
    }
    if (error) throwRpcSetupError(error)
    const transitioned = data?.changed === true
    const notificationsSent = data?.status === 'approved'
      ? await notifyApprovalEvents(params.userId, transitioned)
      : false
    if (transitioned) return notificationsSent ? 'approved' : 'approved-notification-warning'
    if (data?.status === 'approved') return notificationsSent ? 'already-approved' : 'already-approved-notification-warning'
    return null
  }
  const { error } = await withTimeout<RpcResult<unknown>>(
    Promise.resolve(supabase.rpc('ai_hub_update_member_v2', {
      p_user_id: params.userId,
      p_status: params.status,
      p_role: params.role,
    }) as unknown as RpcResult<unknown>),
    AI_HUB_RPC_TIMEOUT_MS,
    'AI HUB ?ъ슜???곹깭 蹂寃쎌씠 吏?곕릺怨??덉뒿?덈떎. Supabase RPC ?⑥닔? 沅뚰븳 ?뺤콉???뺤씤??二쇱꽭??',
  )
  if (error) throwRpcSetupError(error)
  return null
}

export async function setAiHubMemberRole(userId: string, role: 'admin' | 'user'): Promise<void> {
  if (!supabase) throw new Error('Supabase ?곌껐 ?ㅼ젙???꾩슂?⑸땲??')
  const { error } = await supabase.rpc('ai_hub_set_member_role_v1', { p_user_id: userId, p_role: role })
  if (error) throw new Error(error.message)
}
