import { getLocalApiBaseUrl } from './localApi'
import { supabase } from './supabase'

const CACHE_KEY = 'ai-hub-org-published-apps-v1'
const LOCAL_API_URL = `${getLocalApiBaseUrl()}/api/apps/published`

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

export function readPublishedAppsCache(): string[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? uniqueIds(parsed.map(String)) : []
  } catch {
    return []
  }
}

function writePublishedAppsCache(ids: string[]): string[] {
  const next = uniqueIds(ids)
  localStorage.setItem(CACHE_KEY, JSON.stringify(next))
  return next
}

function parsePublishedPayload(data: unknown): string[] {
  if (Array.isArray(data)) {
    return uniqueIds(
      data.map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'app_id' in item) {
          return String((item as { app_id: unknown }).app_id)
        }
        return ''
      }),
    )
  }
  if (data && typeof data === 'object' && Array.isArray((data as { appIds?: unknown }).appIds)) {
    return uniqueIds(((data as { appIds: unknown[] }).appIds).map(String))
  }
  return []
}

async function fetchRemotePublishedApps(): Promise<string[] | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.rpc('ai_hub_list_published_apps')
    if (error) return null
    return parsePublishedPayload(data)
  } catch {
    return null
  }
}

async function fetchLocalPublishedApps(): Promise<string[] | null> {
  try {
    const res = await fetch(LOCAL_API_URL)
    if (!res.ok) return null
    return parsePublishedPayload(await res.json())
  } catch {
    return null
  }
}

async function setRemotePublished(appId: string, published: boolean): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('ai_hub_set_app_published', {
    p_app_id: appId,
    p_published: published,
  })
  return !error
}

async function setLocalPublished(appId: string, published: boolean): Promise<string[] | null> {
  try {
    const res = await fetch(`${LOCAL_API_URL}/${encodeURIComponent(appId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published }),
    })
    if (!res.ok) return null
    return parsePublishedPayload(await res.json())
  } catch {
    return null
  }
}

export async function fetchPublishedApps(): Promise<string[]> {
  const [remote, local] = await Promise.all([fetchRemotePublishedApps(), fetchLocalPublishedApps()])
  if (remote || local) {
    return writePublishedAppsCache(uniqueIds([...(remote ?? []), ...(local ?? [])]))
  }
  return readPublishedAppsCache()
}

export async function setAppPublished(appId: string, published: boolean): Promise<void> {
  const id = appId.trim()
  if (!id) throw new Error('app_id is required')

  const [remoteOk, localIds] = await Promise.all([
    setRemotePublished(id, published),
    setLocalPublished(id, published),
  ])

  if (!remoteOk && !localIds) {
    throw new Error('앱 등록 상태를 저장하지 못했습니다.')
  }

  await fetchPublishedApps()
}
