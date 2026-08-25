// 원격 앱 로더 — 공동 마켓플레이스에 등록된 앱을 실행 중에 불러온다.
//
// 앱 번들은 정적 import 가 없는 ESM 한 파일이며, 호스트가 넘겨주는 React 를 받아
// AppPlugin 을 돌려주는 팩토리를 default 로 내보낸다. 그래서 앱을 추가하려고
// 허브를 다시 빌드할 필요가 없고, 앱이 React 를 따로 번들할 필요도 없다.
//
//   export default ({ React }) => ({ id, name, icon, description, category,
//                                    defaultSize, Body })
//
// 자세한 규격과 예제는 doc/REMOTE_APPS.md 참고.

import React from 'react'
import type { AppPlugin, AppCategory } from './types'

export interface RemoteAppMeta {
  id: string
  name: string
  icon: string
  description: string
  category: string
  version: string
  author: string | null
  license: string | null
  sourceUrl: string | null
  size: number
  sha256: string
  uploadedBy: string | null
  uploadedAt: string
}

/** 로드 결과 — 실패한 앱도 이유와 함께 남겨 관리자 화면에서 보여준다. */
export interface RemoteAppLoadResult {
  meta: RemoteAppMeta
  plugin?: AppPlugin
  error?: string
}

const CATEGORIES: AppCategory[] = ['코어', '생산성', '운영', 'AI']

function authToken(): string {
  return (
    (import.meta.env.VITE_INVENTORY_TOKEN as string | undefined)?.trim() ||
    localStorage.getItem('auth_token') ||
    localStorage.getItem('authToken') ||
    ''
  )
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`/api/apps${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${authToken()}`,
      'ngrok-skip-browser-warning': '1',
      ...(init.headers ?? {}),
    },
  })
}

/** 서버에 등록된 원격 앱 메타데이터 목록 */
export async function fetchRemoteAppList(): Promise<RemoteAppMeta[]> {
  try {
    const res = await api('/remote')
    if (!res.ok) return []
    const body = (await res.json()) as RemoteAppMeta[]
    return Array.isArray(body) ? body : []
  } catch {
    return []
  }
}

/**
 * 팩토리가 돌려준 값이 AppPlugin 계약을 지키는지 확인한다.
 * 원격 코드가 잘못된 모양을 주면 허브 전체가 깨지므로 여기서 막는다.
 */
function toPlugin(meta: RemoteAppMeta, raw: unknown): AppPlugin {
  if (!raw || typeof raw !== 'object') throw new Error('팩토리가 객체를 반환하지 않았습니다.')
  const r = raw as Partial<AppPlugin>
  if (typeof r.Body !== 'function') throw new Error('Body 컴포넌트가 없습니다.')

  const size = r.defaultSize
  const defaultSize = size && typeof size === 'object'
    ? {
        w: Number(size.w) || 4, h: Number(size.h) || 3,
        minW: Number(size.minW) || 2, minH: Number(size.minH) || 2,
      }
    : { w: 4, h: 3, minW: 2, minH: 2 }

  return {
    // 서버 메타데이터를 우선한다 — 목록 화면과 실제 앱이 어긋나지 않게.
    id: meta.id,
    name: meta.name || r.name || meta.id,
    icon: meta.icon || r.icon || 'extension',
    description: meta.description || r.description || '',
    category: (CATEGORIES.includes(meta.category as AppCategory)
      ? meta.category
      : 'AI') as AppCategory,
    version: meta.version,
    author: meta.author ?? undefined,
    defaultSize,
    // 원격 앱은 항상 사용자가 직접 설치한다. 코어로 승격하거나 자동 설치하지 않는다.
    core: false,
    defaultActive: false,
    defaultInstalled: false,
    bodyClassName: typeof r.bodyClassName === 'string' ? r.bodyClassName : undefined,
    Body: r.Body,
    HeaderExtra: typeof r.HeaderExtra === 'function' ? r.HeaderExtra : undefined,
    Provider: typeof r.Provider === 'function' ? r.Provider : undefined,
  }
}

/**
 * 앱 하나를 내려받아 등록 가능한 형태로 만든다.
 *
 * 번들은 인증된 요청으로 받아 Blob URL 로 import 한다.
 * import() 는 헤더를 붙일 수 없어서, 먼저 fetch 로 받아온 뒤 넘긴다.
 */
export async function loadRemoteApp(meta: RemoteAppMeta): Promise<RemoteAppLoadResult> {
  let objectUrl: string | undefined
  try {
    const res = await api(`/remote/${encodeURIComponent(meta.id)}/bundle`)
    if (!res.ok) throw new Error(`번들을 받지 못했습니다 (${res.status})`)
    const code = await res.text()

    objectUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    const mod = (await import(/* @vite-ignore */ objectUrl)) as { default?: unknown }

    const factory = mod.default
    if (typeof factory !== 'function') {
      throw new Error('export default 가 팩토리 함수가 아닙니다.')
    }
    // 호스트의 React 를 넘긴다 — 앱이 React 를 따로 번들하면 훅이 깨진다.
    const produced = await (factory as (host: { React: typeof React }) => unknown)({ React })
    return { meta, plugin: toPlugin(meta, produced) }
  } catch (e) {
    return { meta, error: e instanceof Error ? e.message : String(e) }
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

/** 등록된 원격 앱을 모두 불러온다. 하나가 실패해도 나머지는 살린다. */
export async function loadAllRemoteApps(): Promise<RemoteAppLoadResult[]> {
  const list = await fetchRemoteAppList()
  return Promise.all(list.map((meta) => loadRemoteApp(meta)))
}

// ── 관리자 조작 ──────────────────────────────────────────────────────────────

export async function uploadRemoteApp(input: {
  bundle: File
  id: string
  name: string
  icon?: string
  description?: string
  category?: string
  version?: string
  author?: string
  license?: string
  sourceUrl?: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const form = new FormData()
    form.append('bundle', input.bundle)
    for (const key of ['id', 'name', 'icon', 'description', 'category', 'version', 'author', 'license', 'sourceUrl'] as const) {
      const value = input[key]
      if (value) form.append(key, String(value))
    }
    const res = await api('/remote', { method: 'POST', body: form })
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) return { ok: false, error: body.error ?? `업로드 실패 (${res.status})` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteRemoteApp(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await api(`/remote/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, error: body.error ?? `삭제 실패 (${res.status})` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
