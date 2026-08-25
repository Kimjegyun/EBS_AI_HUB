// Survey session store (IndexedDB-backed) with a simple pub/sub so the UI can
// react to changes. A session represents one category run (e.g. "2026년 정기재물조사")
// and holds per-asset results keyed by asset number.

import { idbDelete, idbGetAll, idbPut, STORE_SESSIONS } from './idb'
import type { SurveyResult, SurveySession } from './types'

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

export interface CreateSessionInput {
  name: string
  datasetId: string
  parentDept: string
  createdBy: string
  dept: string
}

export async function createSession(input: CreateSessionInput): Promise<SurveySession> {
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
  emit()
  return session
}

async function saveSession(session: SurveySession): Promise<void> {
  await idbPut(STORE_SESSIONS, session)
  emit()
}

export async function deleteSession(id: string): Promise<void> {
  await idbDelete(STORE_SESSIONS, id)
  emit()
}

/** Insert or update a single asset result (건별 저장). */
export async function upsertResult(sessionId: string, result: SurveyResult): Promise<SurveySession> {
  const session = await getSession(sessionId)
  if (!session) throw new Error('세션을 찾을 수 없습니다.')
  const next: SurveySession = {
    ...session,
    results: { ...session.results, [result.assetNo]: result },
    // Re-opening for edits clears a prior completion flag.
    completed: false,
    completedAt: undefined,
  }
  await saveSession(next)
  return next
}

export async function removeResult(sessionId: string, assetNo: string): Promise<void> {
  const session = await getSession(sessionId)
  if (!session) return
  const results = { ...session.results }
  delete results[assetNo]
  await saveSession({ ...session, results })
}

export async function markCompleted(sessionId: string, completed: boolean): Promise<void> {
  const session = await getSession(sessionId)
  if (!session) return
  await saveSession({
    ...session,
    completed,
    completedAt: completed ? new Date().toISOString() : undefined,
  })
}

export async function markUploaded(sessionId: string): Promise<void> {
  const session = await getSession(sessionId)
  if (!session) return
  await saveSession({ ...session, uploadedAt: new Date().toISOString() })
}

export function sessionStats(session: SurveySession) {
  const results = Object.values(session.results)
  const confirmed = results.filter((r) => r.confirmed).length
  const abnormal = results.filter((r) => r.status !== '정상').length
  return { total: results.length, confirmed, abnormal }
}
