// Thin HTTP client for the /api/inventory server endpoints.
// Falls back gracefully when the server is unreachable — callers handle the
// returned { ok: false } shape and queue operations locally.

import type { SurveyResult, SurveySession } from './types'
import { appendIoLog } from '../../lib/ioLog'

/**
 * 인벤토리 API 인증 토큰 조회 — 우선순위:
 *  1. VITE_INVENTORY_TOKEN 환경변수 (서버 ADMIN_ACCESS_CODE와 동일 값으로 설정)
 *  2. localStorage 'auth_token' (localServerApi.login() 저장)
 *  3. localStorage 'authToken' (레거시)
 */
function getStoredToken(): string {
  return (
    (import.meta.env.VITE_INVENTORY_TOKEN as string | undefined)?.trim() ||
    localStorage.getItem('auth_token') ||
    localStorage.getItem('authToken') ||
    ''
  )
}

/** Shared fetch wrapper — injects JWT and writes every request/response to IoLog. */
async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getStoredToken()
  const method = (init.method ?? 'GET').toUpperCase()
  const channel = 'inventory'

  // Log outgoing request
  appendIoLog({
    direction: 'out',
    channel,
    title: `${method} /api/inventory${path}`,
    body: init.body && typeof init.body === 'string' ? init.body : '',
  })

  const res = await fetch(`/api/inventory${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'ngrok-skip-browser-warning': '1',
      ...(init.headers ?? {}),
    },
  })

  // Log incoming response (only on error or non-GET)
  if (!res.ok || method !== 'GET') {
    const clone = res.clone()
    clone.text().then((body) => {
      appendIoLog({
        direction: res.ok ? 'in' : 'error',
        channel,
        title: `${res.status} ${res.statusText} ← ${method} /api/inventory${path}`,
        body: body.slice(0, 2000),
      })
    }).catch(() => {})
  }

  return res
}

// ─── Connection probe ─────────────────────────────────────────────────────────

export async function isServerReachable(): Promise<boolean> {
  try {
    const res = await fetch('/health', { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

// ─── Dataset types ────────────────────────────────────────────────────────────

export interface ServerDatasetMeta {
  id: string
  title: string
  parentDept: string
  assetCount: number
  uploadedAt: string
  source: string | null
}

// ─── Datasets ────────────────────────────────────────────────────────────────

export async function fetchServerDatasets(): Promise<ServerDatasetMeta[]> {
  try {
    const res = await apiFetch('/datasets')
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function fetchServerAssets(datasetId: string): Promise<unknown[]> {
  const res = await apiFetch(`/datasets/${datasetId}/assets`)
  if (!res.ok) throw new Error(`자산 데이터 다운로드 실패 (${res.status})`)
  return res.json()
}

/** 본부별 자산현황을 재물조사 양식 xlsx 파일로 다운로드 (브라우저 Save As) */
export async function downloadDatasetExcel(datasetId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = getStoredToken()
    const res = await fetch(`/api/inventory/datasets/${datasetId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const body = (await res.json()) as { error?: string }
      return { ok: false, error: body.error ?? '다운로드 실패' }
    }
    const blob = await res.blob()
    const cd = res.headers.get('Content-Disposition') ?? ''
    let fileName = '자산현황_재물조사양식.xlsx'
    const m = cd.match(/filename\*=UTF-8''([^;\r\n]+)/i) ?? cd.match(/filename="?([^";\r\n]+)"?/i)
    if (m) fileName = decodeURIComponent(m[1])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 완성된 재물조사 엑셀 → 서버에 세션 결과로 일괄 업로드 */
export async function uploadSurveyResultFile(opts: {
  datasetId: string
  file: File
  sessionName?: string
  dept?: string
  sessionId?: string
}): Promise<{ ok: boolean; sessionId?: string; updated?: number; total?: number; error?: string }> {
  try {
    const token = getStoredToken()
    const form = new FormData()
    form.append('survey_result', opts.file)
    if (opts.sessionName) form.append('sessionName', opts.sessionName)
    if (opts.dept) form.append('dept', opts.dept)
    if (opts.sessionId) form.append('sessionId', opts.sessionId)
    const res = await fetch(`/api/inventory/datasets/${opts.datasetId}/survey-upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    if (!res.ok) {
      const body = (await res.json()) as { error?: string }
      return { ok: false, error: body.error ?? '업로드 실패' }
    }
    const body = (await res.json()) as { ok: boolean; sessionId: string; updated: number; total: number }
    return { ok: true, sessionId: body.sessionId, updated: body.updated, total: body.total }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function uploadDatasetFile(
  file: File,
  title: string,
  parentDept: string,
  id?: string,
): Promise<{ ok: boolean; id?: string; assetCount?: number; error?: string }> {
  try {
    const token = getStoredToken()
    const form = new FormData()
    form.append('file', file)
    form.append('title', title)
    form.append('parentDept', parentDept)
    if (id) form.append('id', id)
    const res = await fetch('/api/inventory/datasets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    if (!res.ok) {
      const body = (await res.json()) as { error?: string }
      return { ok: false, error: body.error ?? '업로드 실패' }
    }
    const body = (await res.json()) as { id: string; assetCount: number }
    return { ok: true, id: body.id, assetCount: body.assetCount }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export interface MergeStats {
  total: number
  merged: number
  surveyOnly: number
  erpOnly: number
}

/** Step1: 운영관리부 양식 서버 임시 저장 → uploadId + 시트 목록 반환 */
export async function uploadSurveyFileToServer(
  file: File,
): Promise<{ ok: boolean; uploadId?: string; sheetNames?: string[]; fileName?: string; error?: string }> {
  try {
    const token = getStoredToken()
    const form = new FormData()
    form.append('survey_list', file)
    const res = await fetch('/api/inventory/datasets/upload-survey', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    if (!res.ok) {
      const body = (await res.json()) as { error?: string }
      return { ok: false, error: body.error ?? '업로드 실패' }
    }
    const body = (await res.json()) as { uploadId: string; sheetNames: string[]; fileName: string }
    return { ok: true, uploadId: body.uploadId, sheetNames: body.sheetNames, fileName: body.fileName }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Step2: uploadId + ERP 파일 → 병합 업로드 */
export async function mergeByUploadId(opts: {
  uploadId: string
  erpFile: File
  sheetName: string
  title: string
  parentDept: string
  id?: string
}): Promise<{ ok: boolean; id?: string; assetCount?: number; stats?: MergeStats; error?: string }> {
  try {
    const token = getStoredToken()
    const form = new FormData()
    form.append('erp_assets', opts.erpFile)
    form.append('uploadId', opts.uploadId)
    form.append('sheetName', opts.sheetName)
    form.append('title', opts.title)
    form.append('parentDept', opts.parentDept)
    if (opts.id) form.append('id', opts.id)
    const res = await fetch('/api/inventory/datasets/merge-by-id', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    if (!res.ok) {
      const body = (await res.json()) as { error?: string }
      return { ok: false, error: body.error ?? '병합 업로드 실패' }
    }
    const body = (await res.json()) as { id: string; assetCount: number; stats: MergeStats }
    return { ok: true, id: body.id, assetCount: body.assetCount, stats: body.stats }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 2파일 병합 업로드: survey_list(운영관리부 양식) + erp_assets(ERP 자산현황) */
export async function mergeDatasetFiles(opts: {
  surveyFile: File
  erpFile: File
  title: string
  parentDept: string
  sheetName?: string
  id?: string
}): Promise<{ ok: boolean; id?: string; assetCount?: number; stats?: MergeStats; error?: string }> {
  try {
    const token = getStoredToken()
    const form = new FormData()
    form.append('survey_list', opts.surveyFile)
    form.append('erp_assets', opts.erpFile)
    form.append('title', opts.title)
    form.append('parentDept', opts.parentDept)
    if (opts.sheetName) form.append('sheetName', opts.sheetName)
    if (opts.id) form.append('id', opts.id)
    const res = await fetch('/api/inventory/datasets/merge', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    if (!res.ok) {
      const body = (await res.json()) as { error?: string }
      return { ok: false, error: body.error ?? '병합 업로드 실패' }
    }
    const body = (await res.json()) as { id: string; assetCount: number; stats: MergeStats }
    return { ok: true, id: body.id, assetCount: body.assetCount, stats: body.stats }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

/**
 * 재물조사 결과 일괄 서버 등록.
 * 세션의 모든 결과를 서버 session에 push하고 completed = true 처리.
 */
export async function submitSurveyResults(
  sessionId: string,
  results: SurveyResult[],
): Promise<{ ok: boolean; submitted: number; error?: string }> {
  try {
    let submitted = 0
    for (const r of results) {
      const res = await apiFetch(`/sessions/${sessionId}/results/${encodeURIComponent(r.assetNo)}`, {
        method: 'PUT',
        body: JSON.stringify(r),
      })
      if (res.ok) submitted++
    }
    // 완료 처리
    await apiFetch(`/sessions/${sessionId}/complete`, {
      method: 'PUT',
      body: JSON.stringify({ completed: true }),
    })
    return { ok: true, submitted }
  } catch (e) {
    return { ok: false, submitted: 0, error: (e as Error).message }
  }
}

type SessionSummary = Omit<SurveySession, 'results'>

export async function fetchServerSessions(): Promise<SessionSummary[]> {
  try {
    const res = await apiFetch('/sessions')
    if (!res.ok) return []
    const rows = (await res.json()) as Array<{
      id: string
      name: string
      datasetId: string
      parentDept: string
      dept: string
      createdBy: string
      createdAt: string
      completed: boolean
      completedAt?: string
      uploadedAt?: string
    }>
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      datasetId: r.datasetId,
      parentDept: r.parentDept,
      dept: r.dept,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      completed: r.completed,
      completedAt: r.completedAt,
      uploadedAt: r.uploadedAt,
      results: {},
    }))
  } catch {
    return []
  }
}

export async function fetchServerSession(id: string): Promise<SurveySession | null> {
  try {
    const res = await apiFetch(`/sessions/${id}`)
    if (!res.ok) return null
    const r = (await res.json()) as {
      id: string; name: string; datasetId: string; parentDept: string
      dept: string; createdBy: string; createdAt: string; completed: boolean
      completedAt?: string; uploadedAt?: string; results: Record<string, SurveyResult>
    }
    return {
      id: r.id, name: r.name, datasetId: r.datasetId, parentDept: r.parentDept,
      dept: r.dept, createdBy: r.createdBy, createdAt: r.createdAt,
      completed: r.completed, completedAt: r.completedAt, uploadedAt: r.uploadedAt,
      results: r.results,
    }
  } catch {
    return null
  }
}

export async function createServerSession(input: {
  name: string
  datasetId: string
  parentDept: string
  dept: string
}): Promise<SurveySession | null> {
  try {
    const res = await apiFetch('/sessions', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    if (!res.ok) return null
    const r = (await res.json()) as SurveySession & { datasetId: string; parentDept: string; createdBy: string; createdAt: string }
    return { ...r, results: {} }
  } catch {
    return null
  }
}

export async function pushResult(
  sessionId: string,
  result: SurveyResult,
): Promise<{ ok: boolean; updatedAt?: string }> {
  try {
    const res = await apiFetch(`/sessions/${sessionId}/results/${encodeURIComponent(result.assetNo)}`, {
      method: 'PUT',
      body: JSON.stringify(result),
    })
    if (!res.ok) return { ok: false }
    return { ok: true, ...(await res.json()) }
  } catch {
    return { ok: false }
  }
}

export async function removeServerResult(
  sessionId: string,
  assetNo: string,
): Promise<boolean> {
  try {
    const res = await apiFetch(`/sessions/${sessionId}/results/${encodeURIComponent(assetNo)}`, {
      method: 'DELETE',
    })
    return res.ok
  } catch {
    return false
  }
}

export async function setServerCompleted(sessionId: string, completed: boolean): Promise<boolean> {
  try {
    const res = await apiFetch(`/sessions/${sessionId}/complete`, {
      method: 'PUT',
      body: JSON.stringify({ completed }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function deleteServerSession(sessionId: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/sessions/${sessionId}`, { method: 'DELETE' })
    return res.ok
  } catch {
    return false
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface SessionStat {
  id: string
  name: string
  dept: string
  parentDept: string
  total: number
  confirmed: number
  abnormal: number
  completed: boolean
  createdAt: string
}

export async function fetchStats(): Promise<SessionStat[]> {
  try {
    const res = await apiFetch('/stats')
    if (!res.ok) return []
    const body = (await res.json()) as { sessions: SessionStat[] }
    return body.sessions
  } catch {
    return []
  }
}

// ─── SSE ─────────────────────────────────────────────────────────────────────

export type SseEventType = 'result_updated' | 'result_deleted' | 'session_completed' | 'heartbeat' | 'connected'

export function openSseStream(
  sessionId: string,
  onEvent: (type: SseEventType, data: unknown) => void,
): () => void {
  const token = getStoredToken()
  const url = `/api/inventory/sessions/${sessionId}/events`
  let es: EventSource | null = null
  let closed = false

  const connect = () => {
    if (closed) return
    // EventSource doesn't support custom headers; pass token as query param
    es = new EventSource(`${url}?token=${encodeURIComponent(token)}`)
    const events: SseEventType[] = ['result_updated', 'result_deleted', 'session_completed', 'heartbeat', 'connected']
    events.forEach((type) => {
      es!.addEventListener(type, (e: MessageEvent) => {
        try { onEvent(type, JSON.parse(e.data)) } catch { /* ignore */ }
      })
    })
    es.onerror = () => {
      es?.close()
      if (!closed) setTimeout(connect, 5000)
    }
  }

  connect()
  return () => {
    closed = true
    es?.close()
  }
}

// ─── Device Pairing ───────────────────────────────────────────────────────────

export interface DevicePair {
  id: string
  deviceName: string
  userName: string
  department: string
  pairCode: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  approvedAt?: string
  lastSeenAt?: string
}

/** 모바일 → 서버: 6자리 페어링 코드 요청 (인증 불필요) */
export async function requestPairCode(opts: {
  deviceName: string
  userName: string
  department?: string
}): Promise<{ ok: boolean; pairCode?: string; status?: string; error?: string }> {
  try {
    // 페어링 요청은 인증 없이도 가능하도록 apiFetch 미사용
    const token = getStoredToken()
    const res = await fetch('/api/inventory/pair/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(opts),
    })
    if (!res.ok) {
      const body = (await res.json()) as { error?: string }
      return { ok: false, error: body.error }
    }
    const body = (await res.json()) as { pairCode: string; status: string }
    return { ok: true, pairCode: body.pairCode, status: body.status }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 관리자: 페어링 코드 승인/거부 */
export async function confirmPairCode(
  pairCode: string,
  action: 'approve' | 'reject',
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apiFetch('/pair/confirm', {
      method: 'POST',
      body: JSON.stringify({ pairCode, action }),
    })
    if (!res.ok) {
      const body = (await res.json()) as { error?: string }
      return { ok: false, error: body.error }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 관리자: 등록된 기기 목록 */
export async function fetchPairedDevices(): Promise<DevicePair[]> {
  try {
    const res = await apiFetch('/pair/devices')
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

/** 관리자 전용 — ngrok authtoken을 서버에 등록합니다. */
export async function saveNgrokToken(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apiFetch('/ngrok-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      return { ok: false, error: data.error ?? `서버 오류 (${res.status})` }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: '서버에 연결할 수 없습니다.' }
  }
}

// ─── 재물조사 산출물 파일 (검수 반영 ERP / 설치부서 대조) ─────────────────────

export type InventoryFileKind = 'erp-inspection' | 'dept-comparison'

export interface InventoryFileMeta {
  id: string
  kind: InventoryFileKind
  parentDept: string
  sessionId: string | null
  fileName: string
  size: number
  summary: string | null
  createdBy: string | null
  createdAt: string
}

/** 생성한 산출물 엑셀을 서버에 보관 */
export async function uploadInventoryFile(opts: {
  blob: Blob
  fileName: string
  kind: InventoryFileKind
  parentDept: string
  sessionId?: string
  summary?: string
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const token = getStoredToken()
    const form = new FormData()
    form.append('file', opts.blob, opts.fileName)
    form.append('kind', opts.kind)
    form.append('parentDept', opts.parentDept)
    if (opts.sessionId) form.append('sessionId', opts.sessionId)
    if (opts.summary) form.append('summary', opts.summary)
    const res = await fetch('/api/inventory/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': '1' },
      body: form,
    })
    const body = (await res.json()) as { id?: string; error?: string }
    if (!res.ok) return { ok: false, error: body.error ?? `보관 실패 (${res.status})` }
    return { ok: true, id: body.id }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 서버에 보관된 산출물 목록 */
export async function fetchInventoryFiles(params: {
  kind?: InventoryFileKind
  parentDept?: string
} = {}): Promise<InventoryFileMeta[]> {
  try {
    const qs = new URLSearchParams()
    if (params.kind) qs.set('kind', params.kind)
    if (params.parentDept) qs.set('parentDept', params.parentDept)
    const res = await apiFetch(`/files${qs.toString() ? `?${qs}` : ''}`)
    if (!res.ok) return []
    return (await res.json()) as InventoryFileMeta[]
  } catch {
    return []
  }
}

/** 브라우저에 파일 저장 (Blob → Save As) */
export function saveBlobAs(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

/** 서버에 보관된 산출물 내려받기 */
export async function downloadInventoryFile(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = getStoredToken()
    const res = await fetch(`/api/inventory/files/${id}/download`, {
      headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': '1' },
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, error: body.error ?? `다운로드 실패 (${res.status})` }
    }
    const cd = res.headers.get('Content-Disposition') ?? ''
    const m = cd.match(/filename\*=UTF-8''([^;\r\n]+)/i) ?? cd.match(/filename="?([^";\r\n]+)"?/i)
    saveBlobAs(await res.blob(), m ? decodeURIComponent(m[1]) : '재물조사_산출물.xlsx')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * 자산 데이터셋 삭제 (관리자).
 * 이 데이터셋을 쓰는 조사 세션이 있으면 서버가 409로 거부합니다.
 * 그때 sessionCount를 보고 사용자에게 확인받은 뒤 force로 다시 부르세요.
 */
export async function deleteServerDataset(
  datasetId: string,
  force = false,
): Promise<{ ok: boolean; needsForce?: boolean; sessionCount?: number; error?: string }> {
  try {
    const res = await apiFetch(`/datasets/${datasetId}${force ? '?force=true' : ''}`, { method: 'DELETE' })
    if (res.status === 409) {
      const body = (await res.json()) as { error?: string; sessionCount?: number }
      return { ok: false, needsForce: true, sessionCount: body.sessionCount, error: body.error }
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, error: body.error ?? `삭제 실패 (${res.status})` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ─── 운영관리부 전사 자산현황 양식 (서버 영속 보관) ───────────────────────────

export interface SurveyFormMeta {
  id: string
  fileName: string
  sheetNames: string[]
  size: number
  uploadedBy: string | null
  uploadedAt: string
}

/** 전사 양식 업로드 — 서버에 파일이 남으므로 새로고침·서버 재시작 후에도 유지됩니다. */
export async function uploadSurveyForm(
  file: File,
): Promise<{ ok: boolean; form?: SurveyFormMeta; error?: string }> {
  try {
    const token = getStoredToken()
    const form = new FormData()
    form.append('survey_list', file)
    const res = await fetch('/api/inventory/datasets/survey-form', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': '1' },
      body: form,
    })
    const body = (await res.json()) as SurveyFormMeta & { error?: string }
    if (!res.ok) return { ok: false, error: body.error ?? `업로드 실패 (${res.status})` }
    return { ok: true, form: body }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** 가장 최근에 올린 전사 양식 (없으면 null) */
export async function fetchSurveyForm(): Promise<SurveyFormMeta | null> {
  try {
    const res = await apiFetch('/datasets/survey-form')
    if (!res.ok) return null
    return (await res.json()) as SurveyFormMeta | null
  } catch {
    return null
  }
}

export async function deleteSurveyForm(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apiFetch(`/datasets/survey-form/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, error: body.error ?? `삭제 실패 (${res.status})` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ─── 자산조사 커버리지 통계 ───────────────────────────────────────────────────
//
// 조사 "건수"가 아니라 데이터셋의 전체 자산을 분모로 삼은 집계입니다.
// 본부(데이터셋) → 설치부서 → 확인자 순으로 내려갑니다.

export interface VerifierStat {
  verifier: string
  verifierDept: string
  surveyed: number
  confirmed: number
  abnormal: number
}

export interface DeptCoverage {
  dept: string
  totalAssets: number
  surveyed: number
  confirmed: number
  abnormal: number
  unsurveyed: number
  verifiers: VerifierStat[]
}

export interface DatasetCoverage {
  datasetId: string
  title: string
  parentDept: string
  totalAssets: number
  surveyed: number
  confirmed: number
  abnormal: number
  unsurveyed: number
  /** 데이터셋에 없는 자산번호로 저장된 조사 결과 수 */
  offMaster: number
  sessionCount: number
  depts: DeptCoverage[]
}

export async function fetchCoverageStats(): Promise<DatasetCoverage[]> {
  try {
    const res = await apiFetch('/stats/coverage')
    if (!res.ok) return []
    const body = (await res.json()) as { datasets: DatasetCoverage[] }
    return body.datasets ?? []
  } catch {
    return []
  }
}

export interface UnsurveyedAsset {
  assetNo: string
  oldAssetNo?: string
  name: string
  model?: string
  spec?: string
  acquiredAt?: string
  serialNo?: string
  dept: string
  location?: string
  manageDept?: string
  equipType?: string
  parentDept?: string
}

/** 아직 조사되지 않은 자산 목록 (데이터셋에는 있으나 조사 결과가 없는 자산) */
export async function fetchUnsurveyedAssets(params: {
  datasetId?: string
  dept?: string
  limit?: number
  offset?: number
} = {}): Promise<{ total: number; assets: UnsurveyedAsset[] }> {
  try {
    const qs = new URLSearchParams()
    if (params.datasetId) qs.set('datasetId', params.datasetId)
    if (params.dept) qs.set('dept', params.dept)
    qs.set('limit', String(params.limit ?? 200))
    qs.set('offset', String(params.offset ?? 0))
    const res = await apiFetch(`/stats/unsurveyed?${qs}`)
    if (!res.ok) return { total: 0, assets: [] }
    return (await res.json()) as { total: number; assets: UnsurveyedAsset[] }
  } catch {
    return { total: 0, assets: [] }
  }
}

// ─── 본부별 ERP 자산현황 원본 (서버 보관 → 현장 앱 자동 로드) ─────────────────

export interface ErpFileMeta {
  id: string
  parentDept: string
  datasetId: string | null
  fileName: string
  size: number
  uploadedBy: string | null
  uploadedAt: string
}

/** 해당 본부의 ERP 원본 메타데이터 (관리자가 등록하지 않았으면 null) */
export async function fetchErpFileMeta(parentDept: string): Promise<ErpFileMeta | null> {
  try {
    const res = await apiFetch(`/datasets/erp-file?parentDept=${encodeURIComponent(parentDept)}`)
    if (!res.ok) return null
    return (await res.json()) as ErpFileMeta | null
  } catch {
    return null
  }
}

/** 보관된 ERP 원본 전체 목록 (관리자 화면에서 본부별 등록 여부 확인용) */
export async function fetchAllErpFiles(): Promise<ErpFileMeta[]> {
  try {
    const res = await apiFetch('/datasets/erp-file')
    if (!res.ok) return []
    const body = (await res.json()) as ErpFileMeta[] | null
    return Array.isArray(body) ? body : []
  } catch {
    return []
  }
}

/** ERP 원본 파일 내려받기 (앱이 IndexedDB에 넣기 위해 Blob으로 받습니다) */
export async function downloadErpFileBlob(id: string): Promise<Blob | null> {
  try {
    const token = getStoredToken()
    const res = await fetch(`/api/inventory/datasets/erp-file/${id}/download`, {
      headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': '1' },
    })
    if (!res.ok) return null
    return await res.blob()
  } catch {
    return null
  }
}
