// Hybrid sync service: wraps the server API with an IndexedDB-backed offline
// queue. When the server is reachable, results are written to both the local
// store and the server. When offline, operations are queued in IndexedDB and
// replayed automatically when the server comes back.
//
// This module replaces (and extends) the old uploadSession() function. The old
// entry-point is kept for backwards compatibility.

import { idbDelete, idbGetAll, idbPut, STORE_PHOTOS, STORE_SESSIONS, STORE_SYNC_QUEUE } from './idb'
import {
  isServerReachable,
  submitSurveyResults,
  type SubmissionResponse,
  setServerCompleted,
  deleteServerSession as deleteServerSessionApi,
  createServerSession,
} from './inventoryApiClient'
import type { SurveyResult, SurveySession, SyncQueueItem } from './types'
import { findContinuingSurvey } from './resumeSurvey'
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
const writingSessions = new Map<string, number>()

async function withSessionWrite<T>(id: string, write: () => Promise<T>): Promise<T> {
  writingSessions.set(id, (writingSessions.get(id) ?? 0) + 1)
  try { return await write() } finally {
    const remaining = (writingSessions.get(id) ?? 1) - 1
    if (remaining) writingSessions.set(id, remaining)
    else writingSessions.delete(id)
  }
}

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

export async function forgetDeletedDatasetSessions(ids: string[]) {
  const deleted = (await getSessions()).filter(session => ids.includes(session.datasetId))
  const sessions = new Set(deleted.map(session => session.id))
  for (const session of deleted) {
    for (const result of Object.values(session.results)) for (const id of result.photoIds || []) await idbDelete(STORE_PHOTOS, id)
    await idbDelete(STORE_SESSIONS, session.id)
  }
  for (const item of await queueGetAll()) if (sessions.has(item.sessionId)) await queueDelete(item.id)
  emit()
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
  await pullServerSessions()
  const previous = findContinuingSurvey(await getSessions(), input)
  if (previous) return previous
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
      // The server may hand back the department's existing shared survey; keep its local results.
      const known = await getSession(serverSession.id)
      if (known) return known
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
  return withSessionWrite(sessionId, async () => {
  log(
    `SAVE RESULT  ${result.assetNo}`,
    `session=${sessionId}  status=${result.status}  confirmed=${result.confirmed}  verifier=${result.verifier}  matched=${result.matched}`,
  )
  const session = await getSession(sessionId)
  if (!session) throw new Error('세션을 찾을 수 없습니다.')
  const previousPhotos = session.results[result.assetNo]
  const keptPhotoIndexes = (previousPhotos?.serverPhotoIds || []).map((_, index) => index).filter(index => {
    const key = previousPhotos?.photoKeys?.[index]
    return !key || !previousPhotos?.photoIds?.includes(key) || !!result.photoIds?.includes(key)
  })
  const serverPhotoIds = result.serverPhotoIds ?? keptPhotoIndexes.map(index => previousPhotos!.serverPhotoIds![index])
  const photoKeys = result.photoKeys ?? keptPhotoIndexes.map(index => previousPhotos?.photoKeys?.[index] || '')
  const next: SurveySession = {
    ...session,
    results: { ...session.results, [result.assetNo]: { ...result, serverPhotoIds, photoKeys, serverRevision: session.results[result.assetNo]?.serverRevision, syncState: 'local', conflict: undefined } },
    completed: false,
    completedAt: undefined,
  }
  for (const item of await queueGetAll()) if (item.sessionId === sessionId && item.result?.assetNo === result.assetNo) await queueDelete(item.id)
  await saveLocalSession(next)

  return next
  })
}

// ── Remove result ─────────────────────────────────────────────────────────────

export async function removeResult(sessionId: string, assetNo: string): Promise<void> {
  return withSessionWrite(sessionId, async () => {
  log(`DELETE RESULT  ${assetNo}  session=${sessionId}`)
  const session = await getSession(sessionId)
  if (!session) return
  if (session.results[assetNo]?.serverRevision || session.results[assetNo]?.syncState === 'saved') throw new Error('서버에 반영된 자산은 삭제 대신 조사 내용을 수정해 주세요.')
  for (const item of await queueGetAll()) if (item.sessionId === sessionId && item.result?.assetNo === assetNo) await queueDelete(item.id)
  const results = { ...session.results }
  delete results[assetNo]
  await saveLocalSession({ ...session, results })

  })
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
  if (!await deleteServerSessionApi(id)) throw new Error('삭제하지 못했습니다. 관리자 권한과 서버 연결을 확인해 주세요. 기존 조사 내용은 보존됩니다.')
  await idbDelete(STORE_SESSIONS, id)
  for (const item of await queueGetAll()) if (item.sessionId === id) await queueDelete(item.id)
  emit()
}

export interface ResetSessionsResult {
  deleted: number
  failed: number
}

/**
 * 선택한 조사 세션을 서버와 이 단말에서 함께 초기화합니다.
 * 서버 삭제가 실패한 세션은 로컬에 남겨 다음 동기화 때 되살아나는 불일치를 막습니다.
 */
export async function resetSurveySessions(sessions: SurveySession[]): Promise<ResetSessionsResult> {
  const deletedIds = new Set<string>()
  let deleted = 0
  let failed = 0

  for (const session of sessions) {
    const serverDeleted = await deleteServerSessionApi(session.id)
    if (!serverDeleted) {
      failed += 1
      continue
    }

    for (const result of Object.values(session.results)) {
      for (const photoId of result.photoIds ?? []) {
        await idbDelete(STORE_PHOTOS, photoId).catch(() => undefined)
      }
    }
    await idbDelete(STORE_SESSIONS, session.id)
    deletedIds.add(session.id)
    deleted += 1
  }

  const queued = await queueGetAll()
  await Promise.all(
    queued
      .filter((item) => deletedIds.has(item.sessionId))
      .map((item) => queueDelete(item.id)),
  )
  emit()
  return { deleted, failed }
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

/**
 * A survey started offline gets its own local id, but the server keeps one shared
 * survey per department. Fold the local copy into the shared one and re-point its
 * queued results, so only that single server copy is ever updated.
 */
async function adoptSharedSession(local: SurveySession, remote: SurveySession): Promise<string> {
  const shared = await getSession(remote.id)
  const sharedResults = { ...remote.results, ...shared?.results }
  // Saved results are already on the server; only carry over unsent edits and assets the shared copy lacks.
  const carried = Object.fromEntries(Object.entries(local.results)
    .filter(([assetNo, result]) => !sharedResults[assetNo] || (result.syncState && result.syncState !== 'saved')))
  await idbPut(STORE_SESSIONS, {
    ...remote,
    ...shared,
    id: remote.id,
    createdBy: shared?.createdBy ?? local.createdBy,
    results: { ...sharedResults, ...carried },
    completed: false,
    completedAt: undefined,
  } satisfies SurveySession)
  await idbDelete(STORE_SESSIONS, local.id)
  for (const item of await queueGetAll()) if (item.sessionId === local.id) await queuePut({ ...item, sessionId: remote.id })
  log(`SESSION JOINED  ${local.id} → ${remote.id}`, 'offline survey merged into the shared department survey')
  emit()
  return remote.id
}

const submissionTasks = new Map<string, Promise<SubmissionResponse>>()
async function transmitSubmission(session: SurveySession, items: SyncQueueItem[]): Promise<SubmissionResponse> {
  const existing = submissionTasks.get(session.id)
  if (existing) return existing
  const task = withSessionWrite(session.id, async () => {
    const remote = await createServerSession({ id: session.id, name: session.name, datasetId: session.datasetId, parentDept: session.parentDept, dept: session.dept })
    if (!remote) return { ok: false, submitted: 0, added: 0, updated: 0, duplicates: 0, failed: items.length, acknowledged: [], conflicts: [], error: '서버에 연결하지 못했습니다. 전송 요청한 결과는 기기에 보관되며 연결 복구 후 재전송합니다.' } as SubmissionResponse
    const sessionId = remote.id === session.id ? session.id : await adoptSharedSession(session, remote)
    const response = await submitSurveyResults(sessionId, items.flatMap(item => item.result ? [item.result] : []))
    const latest = await getSession(sessionId)
    if (!latest) return response
    const results = { ...latest.results }
    for (const ack of response.acknowledged) {
      const item = items.find(entry => entry.result?.assetNo === ack.assetNo)
      const current = results[ack.assetNo]
      if (current && current.surveyedAt === item?.result?.surveyedAt && current.syncState === 'pending') {
        results[ack.assetNo] = { ...current, ...ack.result, serverRevision: ack.revision, syncState: 'saved', conflict: undefined }
      } else if (current) results[ack.assetNo] = { ...current, serverRevision: ack.revision }
      if (item) await queueDelete(item.id)
    }
    for (const conflict of response.conflicts) {
      const item = items.find(entry => entry.result?.assetNo === conflict.assetNo)
      const current = results[conflict.assetNo]
      if (current && current.surveyedAt === item?.result?.surveyedAt) results[conflict.assetNo] = { ...current, syncState: 'conflict', conflict }
      if (item) await queueDelete(item.id)
    }
    await saveLocalSession({ ...latest, results, workbook: response.workbook || latest.workbook, uploadedAt: response.submitted ? new Date().toISOString() : latest.uploadedAt })
    return response
  })
  submissionTasks.set(session.id, task)
  try { return await task } finally { submissionTasks.delete(session.id) }
}

/** Only this explicit action grants permission for automatic retries. */
export async function requestSubmission(sessionId: string): Promise<SubmissionResponse> {
  const session = await getSession(sessionId)
  if (!session) throw new Error('조사를 찾을 수 없습니다.')
  const results = { ...session.results }
  for (const result of Object.values(results)) {
    if (!result.confirmed || result.syncState === 'saved' || result.syncState === 'conflict') continue
    for (const item of await queueGetAll()) if (item.sessionId === sessionId && item.result?.assetNo === result.assetNo) await queueDelete(item.id)
    results[result.assetNo] = { ...result, syncState: 'pending' }
    await enqueueOp({ sessionId, action: 'upsert', result: results[result.assetNo], userAuthorized: true })
  }
  const next = { ...session, results }
  await saveLocalSession(next)
  return transmitSubmission(next, (await queueGetAll()).filter(item => item.sessionId === sessionId && item.userAuthorized))
}

export async function resolveSubmissionConflict(sessionId: string, assetNo: string, useLocal: boolean) {
  const session = await getSession(sessionId)
  const result = session?.results[assetNo]
  if (!session || !result?.conflict) return
  const { revision, result: remote } = result.conflict
  await saveLocalSession({ ...session, results: { ...session.results, [assetNo]: useLocal
    ? { ...result, serverRevision: revision, syncState: 'local', conflict: undefined }
    : { ...remote, assetNo, serverRevision: revision, syncState: 'saved', conflict: undefined } } })
}

let flushing = false
async function flushQueue(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    const items = await queueGetAll()
    // Old auto-save queue entries were not explicitly submitted by the user.
    for (const item of items.filter(entry => !entry.userAuthorized)) {
      const session = await getSession(item.sessionId)
      if (session && item.result && !session.results[item.result.assetNo]?.serverRevision) {
        await saveLocalSession({ ...session, results: { ...session.results, [item.result.assetNo]: { ...item.result, syncState: 'local' } } })
      }
      await queueDelete(item.id)
    }
    for (const sessionId of new Set(items.filter(item => item.userAuthorized && item.action === 'upsert').map(item => item.sessionId))) {
      const session = await getSession(sessionId)
      if (session) await transmitSubmission(session, items.filter(item => item.sessionId === sessionId && item.userAuthorized))
    }
    for (const session of await getSessions()) if (session.workbook?.status === 'error') await transmitSubmission(session, [])
  } finally { flushing = false }
}

// Start background flush loop every 30 seconds
let flushTimer: ReturnType<typeof setInterval> | null = null
export function startSyncLoop(): void {
  if (flushTimer) return
  flushTimer = setInterval(() => void flushQueue().then(() => pullServerSessions()).catch(() => {}), 30_000)
  window.addEventListener('online', retryOnline)
  void flushQueue().catch(() => {})
}
const retryOnline = () => { void flushQueue().catch(() => {}) }

export function stopSyncLoop(): void {
  window.removeEventListener('online', retryOnline)
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
}

// ── Server-pull: merge server sessions into local IndexedDB ──────────────────
// Called on app mount to import sessions created by other users/devices.

let pullInFlight: Promise<void> | null = null
export function pullServerSessions(): Promise<void> {
  if (!pullInFlight) pullInFlight = refreshServerSessions().finally(() => { pullInFlight = null })
  return pullInFlight
}

async function refreshServerSessions(): Promise<void> {
  const reachable = await isServerReachable()
  if (!reachable) return

  try {
    const { fetchServerSessions, fetchServerSession } = await import('./inventoryApiClient')
    const summaries = await fetchServerSessions()
    for (const summary of summaries) {
      // Existing sessions also change when a phone saves more results.
      // Preserve pending/offline edits and anything written during this request.
      if (writingSessions.has(summary.id)) continue
      const before = JSON.stringify(await getSession(summary.id))
      const full = await fetchServerSession(summary.id)
      if (!full || writingSessions.has(summary.id)) continue
      const pending = await queueGetAll()
      if (pending.some((item) => item.sessionId === summary.id)) continue
      if (writingSessions.has(summary.id) || before !== JSON.stringify(await getSession(summary.id))) continue
      const local = await getSession(summary.id)
      const localEdits = Object.fromEntries(Object.entries(local?.results || {}).filter(([, result]) => result.syncState && result.syncState !== 'saved'))
      await idbPut(STORE_SESSIONS, { ...full, createdBy: local?.createdBy ?? full.createdBy, workbook: local?.workbook, results: { ...full.results, ...localEdits } })
      cache = null
    }
    // Local copies the server no longer has (merged duplicates, or surveys started offline)
    // fold into the department's shared survey, so each device lists only that one.
    const serverIds = new Set(summaries.map(summary => summary.id))
    const sessions = await getSessions()
    for (const local of sessions) {
      if (serverIds.has(local.id) || writingSessions.has(local.id)) continue
      const shared = findContinuingSurvey(sessions.filter(session => serverIds.has(session.id)), local)
      if (shared) await withSessionWrite(local.id, () => adoptSharedSession(local, shared))
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
  const response = await requestSubmission(session.id)
  return { ok: response.ok, mode: response.ok ? 'server' : 'local', message: response.error || `신규 ${response.added}건 · 수정 ${response.updated}건 · 중복 ${response.duplicates}건 · 서버 저장 완료` }
}
