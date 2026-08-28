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
  /** 심사 단위인 버전 행의 id */
  versionId?: number
  /** 제출자가 선언한 접근 범위 */
  permissions?: RemoteAppPermission[]
  status?: RemoteAppStatus
  submitNote?: string
  submittedByName?: string | null
  submittedAt?: string
  reviewedByName?: string | null
  reviewedAt?: string | null
  reviewNote?: string
}

/** 제출자가 선언하는 접근 범위 — 심사자가 무엇을 볼지 알려준다. */
export const REMOTE_APP_PERMISSIONS = ['network', 'storage', 'hub-api', 'ai', 'clipboard'] as const
export type RemoteAppPermission = (typeof REMOTE_APP_PERMISSIONS)[number]

export const PERMISSION_LABELS: Record<RemoteAppPermission, string> = {
  network: '외부 네트워크 호출',
  storage: '브라우저 저장소',
  'hub-api': '허브 API 호출',
  ai: 'AI 게이트웨이',
  clipboard: '클립보드',
}

export type RemoteAppStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

export const STATUS_LABELS: Record<RemoteAppStatus, string> = {
  pending: '심사 대기',
  approved: '배포 중',
  rejected: '반려됨',
  suspended: '배포 정지',
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
  try {
    // versionId 를 붙이면 승인 전 버전도 받을 수 있다 (관리자·제출자 본인만).
    const query = meta.versionId ? `?versionId=${meta.versionId}` : ''
    const res = await api(`/remote/${encodeURIComponent(meta.id)}/bundle${query}`)
    if (!res.ok) throw new Error(`번들을 받지 못했습니다 (${res.status})`)
    return await instantiate(meta, await res.text())
  } catch (e) {
    return { meta, error: e instanceof Error ? e.message : String(e) }
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

// ── 앱 이식 (내보내기 / 가져오기) ────────────────────────────────────────────
//
// 한 조직에서 만든 앱을 파일 하나로 내보내면, 다른 조직이 그 파일만으로 그대로
// 가져다 쓸 수 있다. 메타데이터와 번들 코드가 함께 들어 있어 따로 입력할 것이 없다.

/** 앱을 .aihubapp.json 파일로 내려받는다. */
export async function exportRemoteApp(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await api(`/remote/${encodeURIComponent(id)}/export`)
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, error: body.error ?? `내보내기 실패 (${res.status})` }
    }
    const cd = res.headers.get('Content-Disposition') ?? ''
    const m = cd.match(/filename\*=UTF-8''([^;\r\n]+)/i) ?? cd.match(/filename="?([^";\r\n]+)"?/i)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = m ? decodeURIComponent(m[1]) : `${id}.aihubapp.json`
    a.click()
    URL.revokeObjectURL(url)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 내보낸 앱 파일을 그대로 가져온다. 메타데이터 입력이 필요 없다. */
export async function importRemoteApp(
  file: File,
): Promise<{ ok: boolean; name?: string; tampered?: boolean; error?: string }> {
  try {
    const form = new FormData()
    form.append('file', file)
    const res = await api('/remote/import', { method: 'POST', body: form })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      tampered?: boolean
      app?: { name?: string }
    }
    if (!res.ok) return { ok: false, error: body.error ?? `가져오기 실패 (${res.status})` }
    return { ok: true, name: body.app?.name, tampered: body.tampered }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── 제출 · 심사 ──────────────────────────────────────────────────────────────
//
// 흐름은 doc/REMOTE_APPS.md 참고.
//   사용자 제출(pending) → 관리자 심사 → 승인(approved) → 배포
// 승인은 앱이 아니라 버전 단위이므로, 승인된 앱을 다른 코드로 바꿔치기할 수 없다.

export interface SubmitInput {
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
  permissions?: RemoteAppPermission[]
  /** 심사자에게 남기는 말 — 무엇을 하는 앱인지, 왜 이 권한이 필요한지 */
  submitNote?: string
}

function toForm(input: SubmitInput): FormData {
  const form = new FormData()
  form.append('bundle', input.bundle)
  const keys = [
    'id', 'name', 'icon', 'description', 'category',
    'version', 'author', 'license', 'sourceUrl', 'submitNote',
  ] as const
  for (const key of keys) {
    const value = input[key]
    if (value) form.append(key, String(value))
  }
  form.append('permissions', JSON.stringify(input.permissions ?? []))
  return form
}

/** 앱을 제출한다. 심사를 통과해야 배포된다. */
export async function submitRemoteApp(
  input: SubmitInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await api('/remote/submit', { method: 'POST', body: toForm(input) })
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) return { ok: false, error: body.error ?? `제출 실패 (${res.status})` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function fetchList(path: string): Promise<RemoteAppMeta[]> {
  try {
    const res = await api(path)
    if (!res.ok) return []
    const body = (await res.json()) as RemoteAppMeta[]
    return Array.isArray(body) ? body : []
  } catch {
    return []
  }
}

/** 내가 낸 제출과 그 결과 */
export function fetchMySubmissions(): Promise<RemoteAppMeta[]> {
  return fetchList('/remote/mine')
}

/** 심사 대기 목록 (관리자). status='all' 이면 이력 전체. */
export function fetchSubmissions(status: RemoteAppStatus | 'all' = 'pending'): Promise<RemoteAppMeta[]> {
  return fetchList(`/remote/submissions?status=${encodeURIComponent(status)}`)
}

export interface VersionCode {
  version: RemoteAppMeta
  code: string
  /** 선언하지 않은 접근 등 심사자가 확인할 지점 */
  flags: string[]
}

/** 심사용으로 제출된 코드를 읽는다 (관리자). */
export async function fetchVersionCode(
  versionId: number,
): Promise<{ ok: boolean; data?: VersionCode; error?: string }> {
  try {
    const res = await api(`/remote/versions/${versionId}/code`)
    const body = (await res.json().catch(() => ({}))) as VersionCode & { error?: string }
    if (!res.ok) return { ok: false, error: body.error ?? `코드를 읽지 못했습니다 (${res.status})` }
    return { ok: true, data: body }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 승인 또는 반려 (관리자). 반려에는 사유가 필요하다. */
export async function reviewVersion(
  versionId: number,
  action: 'approve' | 'reject',
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await api(`/remote/versions/${versionId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note }),
    })
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) return { ok: false, error: body.error ?? `처리 실패 (${res.status})` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** 배포 정지 / 해제 (관리자). 삭제와 달리 되돌릴 수 있다. */
export async function setAppSuspended(
  id: string,
  suspended: boolean,
  note = '',
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await api(`/remote/${encodeURIComponent(id)}/${suspended ? 'suspend' : 'resume'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    })
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) return { ok: false, error: body.error ?? `처리 실패 (${res.status})` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── 로컬 미리보기 ────────────────────────────────────────────────────────────
//
// 제출하기 전에 내 번들이 허브 안에서 실제로 도는지 확인한다.
// 서버에 아무것도 올리지 않으며, 새로고침하면 사라진다. 나만 본다.

export const PREVIEW_PREFIX = 'preview-'

/** 로컬 파일을 그 자리에서 플러그인으로 만든다. 서버를 거치지 않는다. */
export async function loadLocalPreview(file: File): Promise<RemoteAppLoadResult> {
  const code = await file.text()
  const meta: RemoteAppMeta = {
    id: `${PREVIEW_PREFIX}${file.name.replace(/\.(m?js)$/i, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`,
    name: `[미리보기] ${file.name}`,
    icon: 'visibility',
    description: '로컬 파일 미리보기 — 서버에 올라가지 않았습니다.',
    category: 'AI',
    version: 'preview',
    author: null,
    license: null,
    sourceUrl: null,
    size: file.size,
    sha256: '',
    uploadedBy: null,
    uploadedAt: new Date().toISOString(),
  }
  return instantiate(meta, code)
}

/** 코드 문자열을 실행해 플러그인으로 만든다. 번들 로딩과 미리보기가 함께 쓴다. */
async function instantiate(meta: RemoteAppMeta, code: string): Promise<RemoteAppLoadResult> {
  let objectUrl: string | undefined
  try {
    objectUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    const mod = (await import(/* @vite-ignore */ objectUrl)) as { default?: unknown }
    const factory = mod.default
    if (typeof factory !== 'function') {
      throw new Error('export default 가 팩토리 함수가 아닙니다.')
    }
    const produced = await (factory as (host: { React: typeof React }) => unknown)({ React })
    return { meta, plugin: toPlugin(meta, produced) }
  } catch (e) {
    return { meta, error: e instanceof Error ? e.message : String(e) }
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}
