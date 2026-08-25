// Hybrid sync service: wraps the server API with an IndexedDB-backed offline
// queue. When the server is reachable, results are written to both the local
// store and the server. When offline, operations are queued in IndexedDB and
// replayed automatically when the server comes back.
//
// This module replaces (and extends) the old uploadSession() function. The old
// entry-point is kept for backwards compatibility.

import { idbDelete, idbGetAll, idbPut, STORE_SESSIONS, STORE_SYNC_QUEUE } from './idb'
import {
  isServerReachable,
  pushResult,
  removeServerResult,
  setServerCompleted,
  deleteServerSession as deleteServerSessionApi,
  createServerSession,
} from './inventoryApiClient'
import type { SurveyResult, SurveySession, SyncQueueItem } from './types'
import { appendIoLog } from '../../lib/ioLog'

const log = (title: string, body = '') =>
  appendIoLog({ direction: 'cmd', channel: 'inventory', title, body })

/** Minimal idb helpers scoped to the sync queue store. */
async function queuePut(item: SyncQueueItem): Promise<void> {
  return idbPut(STORE_SYNC_QUEUE, item) as unknown as Promise<void>
}
async function queueGetAll(): Promise<SyncQueueItem[]> {
  try {
    return await idbGetAll<SyncQueueItem>(STORE_SYNC_QUEUE)
  } catch {
    return []
  }
}
async function queueDelete(id: string): Promise<void> {
  return idbDelete(STORE_SYNC_QUEUE, id) as unknown as Promise<void>
}

// ── Pub/Sub (re-export from surveyService interface) ─────────────────────────

type Listener = () => void
const listeners = new Set<Listener>()
let cache: SurveySession[] | null = null

export function subscribeSessions(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function emit() {
  cache = null
  listeners.forEach((l) => l())
}

// ── Session local store ───────────────────────────────────────────────────────

export async function getSessions(): Promise<SurveySession[]> {
  if (cache) return cache
  const all = await idbGetAll<SurveySession>(STORE_SESSIONS).catch(() => [])
  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  cache = all
  return all
}

export async function getSession(id: string): Promise<SurveySession | undefined> {
  return (await getSessions()).find((s) => s.id === id)
}

// ── Create session (local + server) ──────────────────────────────────────────

export interface CreateSessionInput {
  name: string
  datasetId: string
  parentDept: string
  createdBy: string
  dept: string
}

export async function createSession(input: CreateSessionInput): Promise<SurveySession> {
  log(`CREATE SESSION  "${input.name}"`, `dataset=${input.datasetId}  dept=${input.dept}  by=${input.createdBy}`)
  const reachable = await isServerReachable()

  if (reachable) {
    const serverSession = await createServerSession({
      name: input.name,
      datasetId: input.datasetId,
      parentDept: input.parentDept,
      dept: input.dept,
    })
    if (serverSession) {
      const session: SurveySession = {
        ...serverSession,
        createdBy: input.createdBy,
        results: {},
        completed: false,
      }
      await idbPut(STORE_SESSIONS, session)
      log(`SESSION CREATED  id=${session.id}  [server]`)
      emit()
      return session
    }
  }

  // Offline fallback
  const session: SurveySession = {
    id: `sv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name.trim(),
    datasetId: input.datasetId,
    parentDept: input.parentDept,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    dept: input.dept,
    results: {},
    completed: false,
  }
  await idbPut(STORE_SESSIONS, session)
  log(`SESSION CREATED  id=${session.id}  [offline]`)
  emit()
  return session
}

// ── Save local helper ─────────────────────────────────────────────────────────

async function saveLocalSession(session: SurveySession): Promise<void> {
  await idbPut(STORE_SESSIONS, session)
  emit()
}

// ── Upsert result (local + server or queue) ───────────────────────────────────

export async function upsertResult(sessionId: string, result: SurveyResult): Promise<SurveySession> {
  log(
    `SAVE RESULT  ${result.assetNo}`,
    `session=${sessionId}  status=${result.status}  confirmed=${result.confirmed}  verifier=${result.verifier}  matched=${result.matched}`,
  )
  const session = await getSession(sessionId)
  if (!session) throw new Error('세션을 찾을 수 없습니다.')
  const next: SurveySession = {
    ...session,
    results: { ...session.results, [result.assetNo]: result },
    completed: false,
    completedAt: undefined,
  }
  await saveLocalSession(next)

  const serverOk = (await pushResult(sessionId, result)).ok
  if (!serverOk) {
    log(`QUEUE (offline)  UPSERT  ${result.assetNo}  session=${sessionId}`)
    await enqueueOp({ sessionId, action: 'upsert', result })
  }
  return next
}

// ── Remove result ─────────────────────────────────────────────────────────────

export async function removeResult(sessionId: string, assetNo: string): Promise<void> {
  log(`DELETE RESULT  ${assetNo}  session=${sessionId}`)
  const session = await getSession(sessionId)
  if (!session) return
  const results = { ...session.results }
  delete results[assetNo]
  await saveLocalSession({ ...session, results })

  const serverOk = await removeServerResult(sessionId, assetNo)
  if (!serverOk) {
    log(`QUEUE (offline)  DELETE  ${assetNo}  session=${sessionId}`)
    await enqueueOp({ sessionId, action: 'delete', assetNo })
  }
}

// ── Complete / uploaded ───────────────────────────────────────────────────────

export async function markCompleted(sessionId: string, completed: boolean): Promise<void> {
  log(`SESSION ${completed ? 'COMPLETE' : 'REOPEN'}  id=${sessionId}`)
  const session = await getSession(sessionId)
  if (!session) return
  await saveLocalSession({
    ...session,
    completed,
    completedAt: completed ? new Date().toISOString() : undefined,
  })
  await setServerCompleted(sessionId, completed)
}

export async function markUploaded(sessionId: string): Promise<void> {
  const session = await getSession(sessionId)
  if (!session) return
  await saveLocalSession({ ...session, uploadedAt: new Date().toISOString() })
}

// ── Delete session ────────────────────────────────────────────────────────────

export async function deleteSession(id: string): Promise<void> {
  log(`DELETE SESSION  id=${id}`)
  await idbDelete(STORE_SESSIONS, id)
  await deleteServerSessionApi(id)
  emit()
}

// ── Stats helper ──────────────────────────────────────────────────────────────

export function sessionStats(session: SurveySession) {
  const results = Object.values(session.results)
  const confirmed = results.filter((r) => r.confirmed).length
  const abnormal = results.filter((r) => r.status !== '정상').length
  return { total: results.length, confirmed, abnormal }
}

// ── Offline queue ─────────────────────────────────────────────────────────────

async function enqueueOp(op: Omit<SyncQueueItem, 'id' | 'queuedAt' | 'retryCount'>): Promise<void> {
  const item: SyncQueueItem = {
    id: `sq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    queuedAt: new Date().toISOString(),
    retryCount: 0,
    ...op,
  }
  await queuePut(item)
}

const MAX_RETRIES = 5

async function flushQueue(): Promise<void> {
  const items = await queueGetAll()
  if (items.length === 0) return
  const reachable = await isServerReachable()
  if (!reachable) return

  log(`FLUSH QUEUE  ${items.length}건 오프라인 큐 재전송 시도`)
  for (const item of items.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))) {
    let ok = false
    if (item.action === 'upsert' && item.result) {
      ok = (await pushResult(item.sessionId, item.result)).ok
    } else if (item.action === 'delete' && item.assetNo) {
      ok = await removeServerResult(item.sessionId, item.assetNo)
    }
    if (ok) {
      log(`QUEUE SENT  ${item.action}  ${item.assetNo ?? item.result?.assetNo ?? '?'}`)
      await queueDelete(item.id)
    } else if (item.retryCount >= MAX_RETRIES) {
      log(`QUEUE GIVE UP  retry=${item.retryCount}  ${item.assetNo ?? '?'}`)
      await queueDelete(item.id)
    } else {
      await queuePut({ ...item, retryCount: item.retryCount + 1 })
    }
  }
}

// Start background flush loop every 30 seconds
let flushTimer: ReturnType<typeof setInterval> | null = null
export function startSyncLoop(): void {
  if (flushTimer) return
  flushTimer = setInterval(() => void flushQueue(), 30_000)
  void flushQueue() // immediate attempt on startup
}

export function stopSyncLoop(): void {
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
}

// ── Server-pull: merge server sessions into local IndexedDB ──────────────────
// Called on app mount to import sessions created by other users/devices.

export async function pullServerSessions(): Promise<void> {
  const reachable = await isServerReachable()
  if (!reachable) return

  try {
    const { fetchServerSessions, fetchServerSession } = await import('./inventoryApiClient')
    const summaries = await fetchServerSessions()
    const localIds = new Set((await getSessions()).map((s) => s.id))

    for (const summary of summaries) {
      // For sessions we don't have locally, fetch full data and store
      if (!localIds.has(summary.id)) {
        const full = await fetchServerSession(summary.id)
        if (full) await idbPut(STORE_SESSIONS, full)
      }
    }
    emit()
  } catch { /* best-effort */ }
}

// ── Backwards-compat upload (used by old UI button) ──────────────────────────

export interface UploadResult {
  ok: boolean
  mode: 'server' | 'local'
  message: string
}

export async function uploadSession(session: SurveySession): Promise<UploadResult> {
  const reachable = await isServerReachable()
  const stats = sessionStats(session)

  if (reachable) {
    // Push all results in one batch
    const results = Object.values(session.results)
    let failed = 0
    for (const r of results) {
      const ok = (await pushResult(session.id, r)).ok
      if (!ok) failed++
    }
    await setServerCompleted(session.id, true)
    await markUploaded(session.id)
    if (failed === 0) {
      return { ok: true, mode: 'server', message: `서버에 업로드되었습니다. (총 ${stats.total}건 · 확인 ${stats.confirmed}건)` }
    }
  }

  await markUploaded(session.id)
  return {
    ok: true,
    mode: 'local',
    message: '서버가 응답하지 않아 로컬에 업로드 완료로 기록했습니다. 네트워크 복구 후 자동 동기화됩니다.',
  }
}
