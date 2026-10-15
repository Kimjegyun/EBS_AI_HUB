import { getCurrentUserStorageId } from '../../lib/userScopedStorage'
import { forgetDataset } from './datasetService'
import { idbDelete, idbGet, idbGetAll, idbPut, STORE_DATASETS, STORE_ERP } from './idb'
import { fetchServerDatasets } from './inventoryApiClient'
import { forgetDeletedDatasetSessions, getSessions } from './syncService'
import { DATASET_SOURCES, type AssetDataset } from './types'
import { forgetLocalWorkbooks } from './workingWorkbook'

/** One row per result that never reached the server before its survey was deleted. */
export interface UnsentBackupRow {
  parentDept: string
  surveyName: string
  assetNo: string
  name: string
  dept: string
  location: string
  status: string
  note: string
  verifierDept: string
  verifier: string
  surveyedAt: string
}
interface UnsentBackup { id: string; rows: UnsentBackupRow[]; updatedAt: string }

const backupKey = () => `unsent-backup:${getCurrentUserStorageId()}`
export const LOCAL_CLEANUP_EVENT = 'inventory-local-cleanup'

export async function getUnsentBackup(): Promise<UnsentBackup | undefined> {
  return idbGet<UnsentBackup>(STORE_ERP, backupKey()).catch(() => undefined)
}

export async function discardUnsentBackup(): Promise<void> {
  await idbDelete(STORE_ERP, backupKey()).catch(() => {})
  window.dispatchEvent(new Event(LOCAL_CLEANUP_EVENT))
}

/** Saves the single backup workbook (all unsent rows kept so far). */
export async function downloadUnsentBackup(): Promise<void> {
  const backup = await getUnsentBackup()
  if (!backup?.rows.length) return
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('미전송 조사결과')
  sheet.columns = [
    { header: '본부', key: 'parentDept', width: 14 }, { header: '조사명', key: 'surveyName', width: 20 },
    { header: '자산번호', key: 'assetNo', width: 20 }, { header: '자산명', key: 'name', width: 24 },
    { header: '설치부서', key: 'dept', width: 16 }, { header: '위치', key: 'location', width: 16 },
    { header: '상태', key: 'status', width: 10 }, { header: '비고', key: 'note', width: 24 },
    { header: '조사부서', key: 'verifierDept', width: 16 }, { header: '조사자', key: 'verifier', width: 12 },
    { header: '조사일시', key: 'surveyedAt', width: 22 },
  ]
  sheet.getRow(1).font = { bold: true }
  backup.rows.forEach((row) => sheet.addRow(row))
  const blob = new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const { saveAs } = await import('file-saver')
  saveAs(blob, `재물조사_미전송_백업_${backup.updatedAt.slice(0, 10)}.xlsx`)
}

/**
 * Mirrors server deletions on this device: when the server no longer has a
 * dataset (its asset master was deleted or replaced), the local surveys, cached
 * dataset, original and working copy for it are removed. Results that were never
 * sent are first appended to the user's single backup workbook.
 *
 * Only runs on a successful server listing, so being offline never deletes
 * anything, and datasets bundled with the app are never touched.
 */
export async function pruneRemovedServerData(): Promise<{ removedSurveys: number; backedUp: number }> {
  const live = new Set((await fetchServerDatasets(true)).map((dataset) => dataset.id))
  const bundled = new Set(DATASET_SOURCES.map((source) => source.id))
  const sessions = await getSessions()
  const cached = await idbGetAll<AssetDataset & { id?: string }>(STORE_DATASETS).catch(() => [])
  const gone = [...new Set([...sessions.map((session) => session.datasetId), ...cached.map((dataset) => dataset.id ?? dataset.meta?.id)])]
    .filter((id) => id && !live.has(id) && !bundled.has(id))
  // Copies from earlier versions are removed even when nothing else changed.
  await forgetLocalWorkbooks(gone)
  if (!gone.length) return { removedSurveys: 0, backedUp: 0 }

  const doomed = sessions.filter((session) => gone.includes(session.datasetId))
  const rows: UnsentBackupRow[] = doomed.flatMap((session) => Object.values(session.results)
    .filter((result) => result.confirmed && result.syncState && result.syncState !== 'saved')
    .map((result) => ({
      parentDept: session.parentDept, surveyName: session.name, assetNo: result.assetNo, name: result.name,
      dept: result.dept, location: result.location, status: result.status, note: result.note,
      verifierDept: result.verifierDept, verifier: result.verifier, surveyedAt: result.surveyedAt,
    })))
  if (rows.length) {
    const previous = await getUnsentBackup()
    await idbPut(STORE_ERP, { id: backupKey(), rows: [...(previous?.rows ?? []), ...rows], updatedAt: new Date().toISOString() } satisfies UnsentBackup)
  }
  for (const id of gone) await forgetDataset(id).catch(() => {})
  await forgetDeletedDatasetSessions(gone)
  window.dispatchEvent(new Event(LOCAL_CLEANUP_EVENT))
  return { removedSurveys: doomed.length, backedUp: rows.length }
}
