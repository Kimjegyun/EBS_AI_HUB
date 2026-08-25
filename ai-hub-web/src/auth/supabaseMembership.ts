import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import type { AuthSession, MembershipStatus, UserRole } from './types'

const AI_HUB_RPC_TIMEOUT_MS = 15_000

export type AiHubMember = {
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
  created_at?: string
  approved_at?: string | null
}

type RpcResult<T> = {
  data: T
  error: { message: string } | null
}

function throwRpcSetupError(error: { message: string }) {
  if (error.message.includes('schema cache') || error.message.includes('Could not find the function')) {
    throw new Error(
      'Supabase AI HUB 인증 RPC가 아직 적용되지 않았습니다. SQL Editor에서 20260605090000_ai_hub_complete_auth_setup.sql을 실행해 주세요.',
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
    'AI HUB 세션 조회가 지연되고 있습니다. Supabase RPC 함수와 네트워크 상태를 확인해 주세요.',
  )
  if (error) throwRpcSetupError(error)
  const row = firstRpcObject(data)
  return row ? mapSessionRow(row) : null
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
    'AI HUB 멤버십 생성이 지연되고 있습니다. Supabase SQL Editor에서 v2 RPC가 생성됐는지 확인해 주세요.',
  )
  if (error) throwRpcSetupError(error)
  const row = firstRpcObject(data)
  return row ? mapSessionRow(row) : null
}

export async function listAiHubMembers(): Promise<AiHubMember[]> {
  if (!supabase) return []
  const { data, error } = await withTimeout<RpcResult<unknown>>(
    Promise.resolve(supabase.rpc('ai_hub_list_members_v2') as unknown as RpcResult<unknown>),
    AI_HUB_RPC_TIMEOUT_MS,
    'AI HUB 사용자 목록 조회가 지연되고 있습니다. Supabase RPC 함수와 권한 정책을 확인해 주세요.',
  )
  if (error) throwRpcSetupError(error)
  return rpcArray(data)
    .map(mapMemberRow)
    .filter((row): row is AiHubMember => row !== null)
}

export async function updateAiHubMember(params: {
  userId: string
  status: MembershipStatus
  role: 'owner' | 'admin' | 'user'
}): Promise<void> {
  if (!supabase) return
  const { error } = await withTimeout<RpcResult<unknown>>(
    Promise.resolve(supabase.rpc('ai_hub_update_member_v2', {
      p_user_id: params.userId,
      p_status: params.status,
      p_role: params.role,
    }) as unknown as RpcResult<unknown>),
    AI_HUB_RPC_TIMEOUT_MS,
    'AI HUB 사용자 상태 변경이 지연되고 있습니다. Supabase RPC 함수와 권한 정책을 확인해 주세요.',
  )
  if (error) throwRpcSetupError(error)
}
