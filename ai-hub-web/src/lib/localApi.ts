import { getPortalScopedItem, getPortalScopedSessionItem } from './portalStorage'

export function getLocalApiToken(): string {
  return (
    // The admin code verified at admin login; kept until logout (see adminAccess.ts).
    getPortalScopedSessionItem('api-admin-token') ||
    getPortalScopedItem('api-admin-token') ||
    localStorage.getItem('auth_token') ||
    localStorage.getItem('authToken') ||
    import.meta.env.VITE_INVENTORY_TOKEN?.trim() ||
    ''
  )
}

export function getLocalApiBaseUrl(): string {
  if (typeof window !== 'undefined') return ''
  const configured = import.meta.env.VITE_API_URL?.trim()
  return (configured || 'http://localhost:3001').replace(/\/+$/, '')
}
