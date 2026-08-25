import { getPortalMode, portalScopedKey } from '../lib/portalStorage'
import { getCurrentAuthSession, userScopedStorageKey } from '../lib/userScopedStorage'

export const MY_LLM_STATE_KEY = 'my-llm-portal-state'
export const MY_LLM_UI_KEY = 'my-llm-ui-v2'

function readCandidate(key: string): { raw: string; updatedAt: number } | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { updatedAt?: unknown }
    return {
      raw,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    }
  } catch {
    return null
  }
}

function collectStateKeys(): string[] {
  const mode = getPortalMode()
  const keys = new Set<string>([
    portalScopedKey(MY_LLM_UI_KEY),
    portalScopedKey(MY_LLM_STATE_KEY),
    userScopedStorageKey(MY_LLM_UI_KEY),
    userScopedStorageKey(MY_LLM_STATE_KEY),
    `ai-hub:${mode}:anonymous:${MY_LLM_UI_KEY}`,
    `ai-hub:${mode}:anonymous:${MY_LLM_STATE_KEY}`,
  ])

  const session = getCurrentAuthSession()
  const identities = [session?.userId, session?.email].filter((value): value is string => Boolean(value))
  for (const identity of identities) {
    const safeId = identity.trim().toLowerCase().replace(/[^a-z0-9._-]+/gi, '_')
    keys.add(`ai-hub:${mode}:${safeId}:${MY_LLM_UI_KEY}`)
    keys.add(`ai-hub:${mode}:${safeId}:${MY_LLM_STATE_KEY}`)
  }

  const prefix = `ai-hub:${mode}:`
  const suffixes = [`:${MY_LLM_STATE_KEY}`, `:${MY_LLM_UI_KEY}`]
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith(prefix)) continue
    if (suffixes.some((suffix) => key.endsWith(suffix))) keys.add(key)
  }

  return [...keys]
}

export function loadRawMyLlmStateCandidates(): string[] {
  const seen = new Set<string>()
  const raws: string[] = []
  for (const item of collectStateKeys().map(readCandidate)) {
    if (!item || seen.has(item.raw)) continue
    seen.add(item.raw)
    raws.push(item.raw)
  }
  return raws
}

export function loadRawMyLlmState(): string | null {
  const candidates = collectStateKeys()
    .map(readCandidate)
    .filter((item): item is { raw: string; updatedAt: number } => Boolean(item))
  if (candidates.length === 0) return null
  return candidates.reduce((best, item) => (item.updatedAt >= best.updatedAt ? item : best)).raw
}

export function saveRawMyLlmState(raw: string): void {
  localStorage.setItem(portalScopedKey(MY_LLM_UI_KEY), raw)
  localStorage.setItem(portalScopedKey(MY_LLM_STATE_KEY), raw)
  localStorage.setItem(userScopedStorageKey(MY_LLM_UI_KEY), raw)
  localStorage.setItem(userScopedStorageKey(MY_LLM_STATE_KEY), raw)
}
