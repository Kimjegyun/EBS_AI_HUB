import type { AuthSession } from '../auth/types'
import { getPortalMode, getPortalScopedSessionItem } from './portalStorage'

const AUTH_STORAGE_KEY = 'ai-hub-auth'

function safeStorageId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/gi, '_')
}

export function getCurrentUserStorageId(): string {
  const session = getCurrentAuthSession()
  const stableId = session?.userId || session?.email
  return stableId ? safeStorageId(stableId) : 'anonymous'
}

export function getCurrentAuthSession(): AuthSession | null {
  try {
    const raw = getPortalScopedSessionItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthSession
  } catch {
    return null
  }
}

export function userScopedStorageKey(baseKey: string): string {
  return `ai-hub:${getPortalMode()}:${getCurrentUserStorageId()}:${baseKey}`
}

export function getUserScopedItem(baseKey: string): string | null {
  return localStorage.getItem(userScopedStorageKey(baseKey))
}

export function setUserScopedItem(baseKey: string, value: string): void {
  localStorage.setItem(userScopedStorageKey(baseKey), value)
}

export function removeUserScopedItem(baseKey: string): void {
  localStorage.removeItem(userScopedStorageKey(baseKey))
}
