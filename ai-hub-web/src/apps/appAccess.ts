import { APP_MAP, APP_REGISTRY, getActiveApps, getInstalledApps } from './registry'
import type { AppPlugin } from './types'

export function resolvePublishedAppIds(publishedIds: string[]): string[] {
  const known = publishedIds.filter((id) => Boolean(APP_MAP[id]))
  return known.length > 0 ? known : APP_REGISTRY.map((app) => app.id)
}

export function isPublishedApp(appId: string, publishedIds: string[]): boolean {
  return resolvePublishedAppIds(publishedIds).includes(appId)
}

export function catalogApps(isAdmin: boolean, publishedIds: string[]): AppPlugin[] {
  if (isAdmin) return APP_REGISTRY
  const allowed = new Set(resolvePublishedAppIds(publishedIds))
  return APP_REGISTRY.filter((app) => allowed.has(app.id))
}

export function filterUsableAppIds(
  ids: string[],
  isAdmin: boolean,
  publishedIds: string[],
): string[] {
  const allowed = new Set(resolvePublishedAppIds(publishedIds))
  return ids.filter((id) => Boolean(APP_MAP[id]) && (isAdmin || allowed.has(id)))
}

export function resolveInstalledAppIds(isAdmin: boolean, publishedIds: string[]): string[] {
  return filterUsableAppIds(getInstalledApps(isAdmin), isAdmin, publishedIds)
}

export function resolveActiveAppIds(isAdmin: boolean, publishedIds: string[]): string[] {
  const installed = new Set(resolveInstalledAppIds(isAdmin, publishedIds))
  return filterUsableAppIds(getActiveApps(isAdmin), isAdmin, publishedIds).filter((id) =>
    isAdmin ? true : installed.has(id),
  )
}

export function canUserSelectApp(appId: string, isAdmin: boolean, publishedIds: string[]): boolean {
  if (!APP_MAP[appId]) return false
  return isAdmin || isPublishedApp(appId, publishedIds)
}
