import { getSupabaseApiToken } from './supabase'
import { removePortalScopedItem, removePortalScopedSessionItem } from './portalStorage'

export function getLocalApiToken(): string {
  // Remove the legacy shared admin code from previous browser builds.
  removePortalScopedSessionItem('api-admin-token')
  removePortalScopedItem('api-admin-token')
  return (
    getSupabaseApiToken() ||
    localStorage.getItem('auth_token') ||
    localStorage.getItem('authToken') ||
    ''
  )
}

export function getLocalApiBaseUrl(): string {
  if (typeof window !== 'undefined') return ''
  const configured = import.meta.env.VITE_API_URL?.trim()
  return (configured || 'http://localhost:3001').replace(/\/+$/, '')
}
