// Account settings sync: everything the app stores per user (user-scoped keys:
// installed/active apps, dashboard layout and size, notes, tasks, personal events,
// survey preferences, ...) follows the account across PC and phones.
//
// Browser storage stays the working copy. The local server keeps one copy per
// Supabase account (/api/users/me/settings/:portal). Each key carries the time it
// last changed, and the newer side wins per key. Deletions sync too.
import { getLocalApiBaseUrl } from './localApi'
import { getPortalMode } from './portalStorage'
import { supabase } from './supabase'
import { getCurrentAuthSession, onUserScopedChange, userScopedStorageKey } from './userScopedStorage'

type Entry = { value: string | null; updatedAt: string }

const META_KEY = '__settings-sync'
// Caches and device-specific or very large state stay local.
const LOCAL_ONLY_PREFIXES = [META_KEY, 'enhanced-calendar-events', 'my-llm-portal-state', 'inventory-active:']
const MAX_VALUE_LENGTH = 256 * 1024
export const SETTINGS_SYNCED_EVENT = 'ai-hub:settings-synced'

const isSynced = (baseKey: string) => !LOCAL_ONLY_PREFIXES.some((prefix) => baseKey.startsWith(prefix))
const fullKey = (baseKey: string) => userScopedStorageKey(baseKey)

function readMeta(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(fullKey(META_KEY)) || '{}') as Record<string, string> } catch { return {} }
}
function writeMeta(meta: Record<string, string>) {
  try { localStorage.setItem(fullKey(META_KEY), JSON.stringify(meta)) } catch { /* quota: next sync retries */ }
}

/** Base keys of this user's synced settings currently in browser storage. */
function localKeys(): string[] {
  const prefix = fullKey('')
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(prefix) && isSynced(key.slice(prefix.length))) keys.push(key.slice(prefix.length))
  }
  return keys
}

async function request(method: 'GET' | 'PUT', body?: unknown, scope = fullKey('')): Promise<Record<string, Entry> | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const account = getCurrentAuthSession()
  if (!token || fullKey('') !== scope || !account ||
    (account.userId ? data.session?.user.id !== account.userId : data.session?.user.email !== account.email)) return null
  const res = await fetch(`${getLocalApiBaseUrl()}/api/users/me/settings/${getPortalMode()}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok || fullKey('') !== scope) return null
  return method === 'GET' ? ((await res.json()) as { settings: Record<string, Entry> }).settings : {}
}

let applyingRemote = false
let pushTimer: ReturnType<typeof setTimeout> | undefined
let enabledScope = ''

async function pushNow(keys: string[], scope = fullKey('')) {
  if (scope !== fullKey('')) return
  const meta = readMeta()
  const settings: Record<string, Entry> = {}
  for (const key of keys) {
    const value = localStorage.getItem(fullKey(key))
    if (value !== null && value.length > MAX_VALUE_LENGTH) continue
    settings[key] = { value, updatedAt: meta[key] ?? new Date().toISOString() }
  }
  if (Object.keys(settings).length) await request('PUT', { settings }, scope)
}

const dirty = new Set<string>()
function schedulePush() {
  clearTimeout(pushTimer)
  const scope = fullKey('')
  pushTimer = setTimeout(() => {
    const keys = [...dirty]
    dirty.clear()
    // On failure the key stays newer locally, so the next pull pushes it again.
    void pushNow(keys, scope).catch(() => {})
  }, 1000)
}

onUserScopedChange((baseKey) => {
  if (enabledScope !== fullKey('') || applyingRemote || !isSynced(baseKey)) return
  const meta = readMeta()
  meta[baseKey] = new Date().toISOString()
  writeMeta(meta)
  dirty.add(baseKey)
  schedulePush()
})

/**
 * Reconciles with the account copy: newer remote values are written into browser
 * storage, newer local ones are pushed. Returns the keys changed locally (empty
 * when offline, not signed in to Supabase, or nothing differed).
 */
export async function syncAccountSettings(): Promise<string[]> {
  const scope = fullKey('')
  if (enabledScope !== scope) {
    clearTimeout(pushTimer)
    dirty.clear()
    enabledScope = ''
  }
  const remote = await request('GET', undefined, scope).catch(() => null)
  if (!remote || fullKey('') !== scope) return []
  enabledScope = scope
  const meta = readMeta()
  const changed: string[] = []
  applyingRemote = true
  try {
    for (const [key, entry] of Object.entries(remote)) {
      if (!isSynced(key)) continue
      const localTime = Date.parse(meta[key] ?? '') || 0
      if (Date.parse(entry.updatedAt) <= localTime) continue
      const storageKey = fullKey(key)
      if (entry.value === null) localStorage.removeItem(storageKey)
      else localStorage.setItem(storageKey, entry.value)
      meta[key] = entry.updatedAt
      changed.push(key)
    }
  } finally {
    applyingRemote = false
  }
  // Local values the account lacks or holds older: first sync from this device, or offline edits.
  const outgoing = [...new Set([...localKeys(), ...Object.keys(meta).filter(isSynced)])].filter((key) => {
    const remoteTime = Date.parse(remote[key]?.updatedAt ?? '') || 0
    if (!meta[key]) meta[key] = new Date().toISOString()
    return Date.parse(meta[key]) > remoteTime
  })
  writeMeta(meta)
  if (outgoing.length) await pushNow(outgoing).catch(() => {})
  if (changed.length) window.dispatchEvent(new CustomEvent(SETTINGS_SYNCED_EVENT, { detail: changed }))
  return changed
}
