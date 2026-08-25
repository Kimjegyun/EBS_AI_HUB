// Central app registry for the EBS AI 허브 plugin hub.
//
// This is the SINGLE source of truth for every installable app. The dashboard,
// the marketplace, and the "설치된 앱" page all derive from it. To add a new app:
//   1. Create `apps/<yourApp>.tsx` exporting an `AppPlugin`.
//   2. Import it here and add it to `APP_REGISTRY`.
// That's it — no other file needs to change.

import type { AppPlugin } from './types'
import { calendarApp } from './calendarApp'
import { codexApp } from './codexApp'
import { quickActionsApp } from './quickActionsApp'
import { tasksApp } from './tasksApp'
import { messagesApp } from './messagesApp'
import { notesApp } from './notesApp'
import { bookmarksApp } from './bookmarksApp'
import { inventoryApp } from './inventoryApp'
import { myLlmApp } from './myLlmApp'
import { emailWriterApp } from './emailWriterApp'
import {
  getCurrentAuthSession,
  getUserScopedItem,
  setUserScopedItem,
} from '../lib/userScopedStorage'

export const APP_REGISTRY: AppPlugin[] = [
  calendarApp,
  myLlmApp,
  emailWriterApp,
  codexApp,
  inventoryApp,
  quickActionsApp,
  tasksApp,
  messagesApp,
  notesApp,
  bookmarksApp,
]

export const APP_MAP: Record<string, AppPlugin> = Object.fromEntries(
  APP_REGISTRY.map((a) => [a.id, a]),
)

export const getApp = (id: string): AppPlugin | undefined => APP_MAP[id]

export const CORE_APP_IDS = APP_REGISTRY.filter((a) => a.core).map((a) => a.id)
export const DEFAULT_INSTALLED = APP_REGISTRY.filter((a) => a.defaultInstalled !== false).map(
  (a) => a.id,
)
export const DEFAULT_ACTIVE = APP_REGISTRY.filter((a) => a.defaultActive).map((a) => a.id)

export const ACTIVE_WIDGETS_KEY = 'dashboard-active-widgets'
export const INSTALLED_APPS_KEY = 'dashboard-installed-apps'

function currentIsAdmin(): boolean {
  return getCurrentAuthSession()?.role === 'admin'
}

function readIds(key: string, fallback: string[]): string[] {
  try {
    const raw = getUserScopedItem(key)
    if (!raw) return [...fallback]
    return (JSON.parse(raw) as string[]).filter((id) => APP_MAP[id])
  } catch {
    return [...fallback]
  }
}

/** Apps installed on the current account. Users start with none until they opt in. */
export function getInstalledApps(isAdmin = currentIsAdmin()): string[] {
  return readIds(INSTALLED_APPS_KEY, isAdmin ? DEFAULT_INSTALLED : [])
}

export function setInstalledApps(ids: string[]): void {
  const set = new Set(ids.filter((id) => APP_MAP[id]))
  setUserScopedItem(INSTALLED_APPS_KEY, JSON.stringify([...set]))
}

export function isInstalled(id: string, isAdmin = currentIsAdmin()): boolean {
  return getInstalledApps(isAdmin).includes(id)
}

export function installApp(id: string): void {
  if (!APP_MAP[id]) return
  const cur = getInstalledApps()
  if (!cur.includes(id)) setInstalledApps([...cur, id])
}

export function uninstallApp(id: string): void {
  if (!APP_MAP[id]) return
  setInstalledApps(getInstalledApps().filter((x) => x !== id))
  setActiveApps(getActiveApps().filter((x) => x !== id))
}

/** Apps currently activated (shown as panels on the dashboard). */
export function getActiveApps(isAdmin = currentIsAdmin()): string[] {
  return readIds(ACTIVE_WIDGETS_KEY, isAdmin ? DEFAULT_ACTIVE : [])
}

export function setActiveApps(ids: string[]): void {
  setUserScopedItem(ACTIVE_WIDGETS_KEY, JSON.stringify(ids.filter((id) => APP_MAP[id])))
}
