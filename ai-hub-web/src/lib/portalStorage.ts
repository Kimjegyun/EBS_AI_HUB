export type PortalMode = 'admin' | 'user'

export function getPortalMode(): PortalMode {
  return import.meta.env.VITE_LOGIN_PORTAL === 'admin' ? 'admin' : 'user'
}

export function portalScopedKey(baseKey: string): string {
  return `ai-hub:${getPortalMode()}:${baseKey}`
}

export function getPortalScopedItem(baseKey: string): string | null {
  return localStorage.getItem(portalScopedKey(baseKey))
}

export function setPortalScopedItem(baseKey: string, value: string): void {
  localStorage.setItem(portalScopedKey(baseKey), value)
}

export function removePortalScopedItem(baseKey: string): void {
  localStorage.removeItem(portalScopedKey(baseKey))
}

export function getPortalScopedSessionItem(baseKey: string): string | null {
  return sessionStorage.getItem(portalScopedKey(baseKey))
}

export function setPortalScopedSessionItem(baseKey: string, value: string): void {
  sessionStorage.setItem(portalScopedKey(baseKey), value)
}

export function removePortalScopedSessionItem(baseKey: string): void {
  sessionStorage.removeItem(portalScopedKey(baseKey))
}
