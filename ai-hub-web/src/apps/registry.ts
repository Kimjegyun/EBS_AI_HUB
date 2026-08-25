// 앱 레지스트리 — 허브에 올라가는 모든 앱의 단일 출처.
//
// 앱은 두 갈래로 들어온다.
//   1) 내장 앱  — 이 파일에 import 하고 BUILTIN_APPS 에 한 줄 추가한다.
//                 (파일 하나 + 한 줄, 셸 코드는 건드리지 않는다)
//   2) 원격 앱  — 관리자가 마켓플레이스에 올린 번들을 실행 중에 내려받아 등록한다.
//                 setRemoteApps() 로 들어오며 허브를 다시 빌드할 필요가 없다.
//
// APP_REGISTRY 와 APP_MAP 은 두 갈래를 합친 결과이며 원격 앱이 로드되면 갱신된다.
// ESM 라이브 바인딩이라 import 한 쪽도 새 값을 본다. 다만 React 가 다시 그리려면
// subscribeRegistry() 로 변경을 구독해야 한다.

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

/** 빌드에 포함되어 함께 배포되는 앱들. */
const BUILTIN_APPS: AppPlugin[] = [
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

/** 마켓플레이스에서 실행 중에 불러온 앱들. */
let remoteApps: AppPlugin[] = []

export let APP_REGISTRY: AppPlugin[] = [...BUILTIN_APPS]
export let APP_MAP: Record<string, AppPlugin> = Object.fromEntries(
  APP_REGISTRY.map((a) => [a.id, a]),
)

type RegistryListener = () => void
const listeners = new Set<RegistryListener>()

function rebuild(): void {
  // 같은 id 면 내장 앱이 이긴다 — 원격 앱이 내장 앱을 덮어쓰지 못하게.
  const builtinIds = new Set(BUILTIN_APPS.map((a) => a.id))
  APP_REGISTRY = [...BUILTIN_APPS, ...remoteApps.filter((a) => !builtinIds.has(a.id))]
  APP_MAP = Object.fromEntries(APP_REGISTRY.map((a) => [a.id, a]))
  for (const listen of listeners) listen()
}

/** 마켓플레이스에서 불러온 앱들을 레지스트리에 반영한다. */
export function setRemoteApps(apps: AppPlugin[]): void {
  remoteApps = apps
  rebuild()
}

export function getRemoteApps(): AppPlugin[] {
  return remoteApps
}

export function isRemoteApp(id: string): boolean {
  return remoteApps.some((a) => a.id === id)
}

/** 레지스트리가 바뀔 때 알림을 받는다 (React 재렌더용). 해제 함수를 돌려준다. */
export function subscribeRegistry(listener: RegistryListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getApp = (id: string): AppPlugin | undefined => APP_MAP[id]

// 새 계정의 기본값은 내장 앱만으로 정한다. 원격 앱은 항상 사용자가 직접 설치한다.
export const CORE_APP_IDS = BUILTIN_APPS.filter((a) => a.core).map((a) => a.id)
export const DEFAULT_INSTALLED = BUILTIN_APPS.filter((a) => a.defaultInstalled !== false).map(
  (a) => a.id,
)
export const DEFAULT_ACTIVE = BUILTIN_APPS.filter((a) => a.defaultActive).map((a) => a.id)

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
