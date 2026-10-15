import { supabase } from './supabase'
import { getPortalScopedItem, setPortalScopedItem } from './portalStorage'
import { getCurrentUserStorageId } from './userScopedStorage'

const LOCAL_USAGE_KEY = 'ai-hub-api-usage-v1'
const GROUP_LIMIT_KEY = 'ai-hub-group-limits-v1'
export const DEFAULT_MONTHLY_TURNS = 5000

export type AiUserUsage = {
  userId: string
  monthlyLimit: number
  usedThisMonth: number
  period: string
  groupId?: string
  /** Individual limit, used again when the user leaves their group. */
  ownLimit?: number
}

export type AiGroupLimit = {
  groupId: string
  groupName: string
  monthlyLimit: number
  memberCount?: number
}

type RpcResult<T> = {
  data: T
  error: { message: string } | null
}

function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function readLocalUsage(): Record<string, AiUserUsage> {
  try {
    const raw = getPortalScopedItem(LOCAL_USAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, AiUserUsage>) : {}
  } catch {
    return {}
  }
}

function writeLocalUsage(value: Record<string, AiUserUsage>): void {
  setPortalScopedItem(LOCAL_USAGE_KEY, JSON.stringify(value))
}

export function readGroupLimits(): Record<string, AiGroupLimit> {
  try {
    const raw = getPortalScopedItem(GROUP_LIMIT_KEY)
    return raw ? (JSON.parse(raw) as Record<string, AiGroupLimit>) : {}
  } catch {
    return {}
  }
}

export function writeGroupLimits(value: Record<string, AiGroupLimit>): void {
  setPortalScopedItem(GROUP_LIMIT_KEY, JSON.stringify(value))
}

/** 월초 리셋 — 저장된 period가 현재 달과 다르면 사용량을 0으로 초기화 */
function resetIfNewPeriod(usage: AiUserUsage): AiUserUsage {
  if (usage.period === currentPeriod()) return usage
  return { ...usage, usedThisMonth: 0, period: currentPeriod() }
}

function normalizeUsage(row: unknown, fallbackUserId: string): AiUserUsage {
  const value = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
  const rawLimit = value.monthly_limit ?? value.monthlyLimit
  const monthlyLimit = rawLimit !== undefined ? Number(rawLimit) : DEFAULT_MONTHLY_TURNS
  return {
    userId: String(value.user_id ?? value.userId ?? fallbackUserId),
    monthlyLimit,
    usedThisMonth: Number(value.used_this_month ?? value.usedThisMonth ?? 0),
    period: String(value.period ?? currentPeriod()),
    groupId: typeof (value.group_id ?? value.groupId) === 'string'
      ? String(value.group_id ?? value.groupId)
      : undefined,
    ownLimit: value.own_limit !== undefined ? Number(value.own_limit) : undefined,
  }
}

export async function getMyAiUsage(): Promise<AiUserUsage> {
  const userId = getCurrentUserStorageId()
  if (supabase) {
    try {
      const { data, error } = (await supabase.rpc('ai_hub_get_my_api_usage_v1')) as RpcResult<unknown>
      if (!error) return resetIfNewPeriod(normalizeUsage(data, userId))
    } catch {
      /* fall back to local development storage */
    }
  }

  const all = readLocalUsage()
  const current = all[userId] ?? {
    userId,
    monthlyLimit: DEFAULT_MONTHLY_TURNS,
    usedThisMonth: 0,
    period: currentPeriod(),
  }
  const reset = resetIfNewPeriod(current)
  if (reset !== current) {
    all[userId] = reset
    writeLocalUsage(all)
  }
  return reset
}

export async function consumeMyAiUsage(units = 1): Promise<{ ok: true } | { ok: false; error: string }> {
  if (supabase) {
    try {
      const { data, error } = (await supabase.rpc('ai_hub_consume_api_usage_v1', {
        p_units: units,
      })) as RpcResult<unknown>
      if (!error) {
        const result = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
        if (result.ok === false) {
          return { ok: false, error: String(result.error ?? '이번 달 사용 가능한 턴을 모두 소진했습니다.') }
        }
        return { ok: true }
      }
    } catch {
      /* fall back to local development storage */
    }
  }

  const userId = getCurrentUserStorageId()
  const all = readLocalUsage()
  const current = all[userId] ?? {
    userId,
    monthlyLimit: DEFAULT_MONTHLY_TURNS,
    usedThisMonth: 0,
    period: currentPeriod(),
  }
  const normalized = resetIfNewPeriod(current)
  if (normalized.usedThisMonth + units > normalized.monthlyLimit) {
    return { ok: false, error: '이번 달 사용 가능한 턴을 모두 소진했습니다. 관리자에게 추가 턴을 요청하세요.' }
  }
  all[userId] = { ...normalized, usedThisMonth: normalized.usedThisMonth + units }
  writeLocalUsage(all)
  return { ok: true }
}

export async function listAiUsage(userIds: string[]): Promise<Record<string, AiUserUsage>> {
  if (supabase) {
    try {
      const { data, error } = (await supabase.rpc('ai_hub_list_api_usage_v1')) as RpcResult<unknown>
      if (!error && Array.isArray(data)) {
        return Object.fromEntries(
          data.map((row) => {
            const usage = resetIfNewPeriod(normalizeUsage(row, ''))
            return [usage.userId, usage]
          }),
        )
      }
    } catch {
      /* fall back to local development storage */
    }
  }

  const all = readLocalUsage()
  for (const userId of userIds) {
    if (!all[userId]) {
      all[userId] = {
        userId,
        monthlyLimit: DEFAULT_MONTHLY_TURNS,
        usedThisMonth: 0,
        period: currentPeriod(),
      }
    } else {
      const reset = resetIfNewPeriod(all[userId])
      if (reset !== all[userId]) all[userId] = reset
    }
  }
  writeLocalUsage(all)
  return all
}

export async function setUserAiLimit(userId: string, monthlyLimit: number): Promise<void> {
  const normalizedLimit = Math.max(0, Math.floor(monthlyLimit))
  if (supabase) {
    try {
      const { error } = (await supabase.rpc('ai_hub_set_user_api_limit_v1', {
        p_user_id: userId,
        p_monthly_limit: normalizedLimit,
      })) as RpcResult<unknown>
      if (!error) return
    } catch {
      /* fall back to local development storage */
    }
  }

  const all = readLocalUsage()
  const current = all[userId] ?? {
    userId,
    monthlyLimit: DEFAULT_MONTHLY_TURNS,
    usedThisMonth: 0,
    period: currentPeriod(),
  }
  all[userId] = { ...current, monthlyLimit: normalizedLimit }
  writeLocalUsage(all)
}

export function setGroupAiLimit(groupId: string, groupName: string, monthlyLimit: number): void {
  const groups = readGroupLimits()
  groups[groupId] = { groupId, groupName, monthlyLimit: Math.max(0, Math.floor(monthlyLimit)) }
  writeGroupLimits(groups)
}

export function deleteGroupAiLimit(groupId: string): void {
  const groups = readGroupLimits()
  delete groups[groupId]
  writeGroupLimits(groups)
}

// ─── Groups (server: ai_hub.api_usage_groups) ─────────────────────────────────
// A member assigned to a group gets the group's monthly limit (enforced by
// ai_hub_consume_api_usage_v1); unassigned members keep their individual limit.

function groupSetupError(error: { message: string }): Error {
  return error.message.includes('Could not find the function') || error.message.includes('schema cache')
    ? new Error('그룹 기능이 Supabase에 아직 설치되지 않았습니다. SQL Editor에서 20261008130000_ai_usage_groups.sql을 실행해 주세요.')
    : new Error(error.message)
}

/** Server groups. Groups saved only in this browser by earlier versions are uploaded once, then cleared. */
export async function listAiGroups(): Promise<Record<string, AiGroupLimit>> {
  if (!supabase) return readGroupLimits()
  const local = readGroupLimits()
  if (Object.keys(local).length) {
    for (const group of Object.values(local)) await saveAiGroup(group.groupId, group.groupName, group.monthlyLimit)
    writeGroupLimits({})
  }
  const { data, error } = (await supabase.rpc('ai_hub_list_api_groups_v1')) as RpcResult<unknown>
  if (error) throw groupSetupError(error)
  return Object.fromEntries((Array.isArray(data) ? data : []).map((row) => {
    const value = row as Record<string, unknown>
    const group: AiGroupLimit = {
      groupId: String(value.group_id), groupName: String(value.group_name),
      monthlyLimit: Number(value.monthly_limit), memberCount: Number(value.member_count ?? 0),
    }
    return [group.groupId, group]
  }))
}

export async function saveAiGroup(groupId: string, groupName: string, monthlyLimit: number): Promise<void> {
  const limit = Math.max(0, Math.floor(monthlyLimit))
  if (!supabase) { setGroupAiLimit(groupId, groupName, limit); return }
  const { error } = (await supabase.rpc('ai_hub_save_api_group_v1', { p_group_id: groupId, p_group_name: groupName, p_monthly_limit: limit })) as RpcResult<unknown>
  if (error) throw groupSetupError(error)
}

/** Members of the deleted group fall back to their individual limit. */
export async function deleteAiGroup(groupId: string): Promise<void> {
  if (!supabase) { deleteGroupAiLimit(groupId); return }
  const { error } = (await supabase.rpc('ai_hub_delete_api_group_v1', { p_group_id: groupId })) as RpcResult<unknown>
  if (error) throw groupSetupError(error)
}

/** groupId null = individual limit. */
export async function setUserAiGroup(userId: string, groupId: string | null): Promise<void> {
  if (!supabase) throw new Error('그룹 지정은 Supabase 연결이 필요합니다.')
  const { error } = (await supabase.rpc('ai_hub_set_user_api_group_v1', { p_user_id: userId, p_group_id: groupId })) as RpcResult<unknown>
  if (error) throw groupSetupError(error)
}
