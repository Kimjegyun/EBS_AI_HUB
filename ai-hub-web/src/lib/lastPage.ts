import { getCurrentAuthSession, getUserScopedItem, setUserScopedItem } from './userScopedStorage'

const KEY = 'last-page'
const userPages = ['/dashboard', '/installed-apps', '/marketplace', '/modules', '/settings']
const adminPages = ['/app-registry', '/users', '/notifications']

function allowed(path: string): boolean {
  return userPages.includes(path) || (getCurrentAuthSession()?.role === 'admin' && adminPages.includes(path))
}

export function readLastPage(): string {
  const path = getUserScopedItem(KEY)
  return path && allowed(path) ? path : '/dashboard'
}

export function saveLastPage(path: string): void {
  if (allowed(path)) setUserScopedItem(KEY, path)
}
