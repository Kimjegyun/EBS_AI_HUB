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
}

export type AiGroupLimit = {
  groupId: string
  groupName: string
  monthlyLimit: number
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
