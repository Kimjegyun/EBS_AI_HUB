import { idbDelete, idbGet, idbGetAll, idbPut, STORE_ERP } from './idb'
import { getCurrentAuthSession, getCurrentUserStorageId } from '../../lib/userScopedStorage'
import type { ErpStore } from './erpLookup'
import type { SurveySession } from './types'
import { fetchWorkingMaster } from './inventoryApiClient'

export interface WorkingWorkbook {
  id: string
  fileName: string
  blob: Blob
  revision: string
  updatedAt: string
  synced: boolean
  /** Survey dataset this copy belongs to, so it is removed with that dataset. */
  datasetId?: string
  error?: string
}

/**
 * Each user keeps exactly two workbooks on a device:
 *  - the original: the survey's master sheet, hidden from the UI and only used to
 *    (re)build the working copy, e.g. when a survey starts over;
 *  - the working copy (반영본): original + this survey's results, including the
 *    inspector's department and name, overwritten on every change.
 * The server never stores either; it merges the uploaded results instead.
 */
interface UserOriginal { id: string; source: string; datasetId: string; data: ArrayBuffer; savedAt: string }
const originalKey = () => `user-original:${getCurrentUserStorageId()}`
const reportKey = () => `user-report:${getCurrentUserStorageId()}`
// Earlier versions stored one original per department and two copies per survey.
const LEGACY_PREFIXES = ['master-source:', 'master-workbook:', 'workbook:']

const writes = new Map<string, Promise<WorkingWorkbook>>()

async function loadOriginal(session: SurveySession): Promise<ArrayBuffer> {
  const source = `${session.datasetId}:${session.dept.trim()}`
  const cached = await idbGet<UserOriginal>(STORE_ERP, originalKey())
  if (cached?.source === source) return cached.data
  const data = await fetchWorkingMaster(session.id)
  await idbPut(STORE_ERP, { id: originalKey(), source, datasetId: session.datasetId, data, savedAt: new Date().toISOString() } satisfies UserOriginal)
  return data
}

/** Update the user's single working copy (반영본) on this device without uploading it. */
export function saveMasterWorkingWorkbook(session: SurveySession): Promise<WorkingWorkbook> {
  const snapshot = structuredClone(session)
  const key = reportKey()
  const task = (writes.get(key) || Promise.resolve()).catch(() => undefined).then(() => buildMasterWorkingWorkbook(snapshot, key))
  writes.set(key, task)
  void task.finally(() => { if (writes.get(key) === task) writes.delete(key) }).catch(() => {})
  return task
}
async function buildMasterWorkingWorkbook(session: SurveySession, id: string): Promise<WorkingWorkbook> {
  const inspector = getCurrentAuthSession()?.displayName?.trim() || session.createdBy
  const revision = JSON.stringify([session.id, inspector, session.results])
  const cached = await idbGet<WorkingWorkbook>(STORE_ERP, id)
  if (cached?.revision === revision) return cached
  const original = await loadOriginal(session)
  const { buildSubmissionWorkbook } = await import('./submissionWorkbook')
  const year = session.name.match(/20\d{2}/)?.[0] || session.createdAt.slice(0, 4)
  const built = await buildSubmissionWorkbook(original, [session], year)
  const saved: WorkingWorkbook = {
    id, revision, blob: built.blob, datasetId: session.datasetId,
    fileName: `${year}_재물조사_${session.parentDept}_${session.dept}_${inspector}.xlsx`,
    updatedAt: new Date().toISOString(), synced: false,
  }
  await idbPut(STORE_ERP, saved)
  return saved
}

/** ERP inspection export: built on demand for download, never stored as another copy. */
export async function saveWorkingWorkbook(session: SurveySession, erp: ErpStore): Promise<WorkingWorkbook> {
  const { buildErpWithInspection } = await import('./inspectionExport')
  const built = await buildErpWithInspection(erp, { ...session, results: structuredClone(session.results) })
  return {
    id: `erp-export:${session.id}`, fileName: built.fileName, blob: built.blob, datasetId: session.datasetId,
    revision: '', updatedAt: new Date().toISOString(), synced: false,
  }
}

/**
 * Removes local workbooks tied to datasets the server deleted, plus copies left by
 * earlier versions. The ERP store ('erp') and other records are untouched.
 */
export async function forgetLocalWorkbooks(deletedDatasetIds: string[]): Promise<void> {
  const deleted = new Set(deletedDatasetIds)
  const records = await idbGetAll<{ id: string; datasetId?: string }>(STORE_ERP).catch(() => [])
  for (const record of records) {
    const legacy = LEGACY_PREFIXES.some((prefix) => record.id.startsWith(prefix))
    const orphaned = (record.id.startsWith('user-original:') || record.id.startsWith('user-report:')) && !!record.datasetId && deleted.has(record.datasetId)
    if (legacy || orphaned) await idbDelete(STORE_ERP, record.id).catch(() => {})
  }
}
