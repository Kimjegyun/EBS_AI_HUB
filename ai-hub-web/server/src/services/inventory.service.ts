// Inventory service — CRUD for datasets and survey sessions (SQLite-backed).
// All SurveyResult / Asset data is stored as JSON blobs to avoid rigid schema
// migration and to mirror the existing IndexedDB structure on the client.

import { run, get, all } from '../config/database'
import { v4 as uuidv4 } from 'uuid'

// ─── Types (mirrors client types.ts) ────────────────────────────────────────

export interface Asset {
  assetNo: string
  oldAssetNo: string
  name: string
  model: string
  spec: string
  acquiredAt: string
  acquiredPrice?: string
  serialNo: string
  dept: string
  deptCode?: string
  location: string
  locationCode?: string
  userDept: string
  userDeptCode?: string
  team: string
  manageDept: string
  manageDeptCode?: string
  equipType: string
  parentDept: string
  assetStatus?: string
  surveyStatus?: string
  remark?: string
  // merge 출처 추적
  _source?: 'erp' | 'survey' | 'merged'
  // 재물조사 확인 정보 (본부별 DB에 기록)
  confirmedInSession?: string   // 확인된 세션 ID
  confirmedAt?: string          // 확인 일시 (ISO)
  confirmedBy?: string          // 확인자 이름
}

export interface DatasetRow {
  id: string
  title: string
  parent_dept: string
  asset_count: number
  uploaded_by: string | null
  uploaded_at: string
  source: string | null
}

export interface SessionRow {
  id: string
  name: string
  dataset_id: string
  parent_dept: string
  dept: string
  created_by: string
  created_at: string
  completed: number
  completed_at: string | null
  uploaded_at: string | null
  results_json: string
  updated_at: string
}

// ─── SSE subscriber registry ─────────────────────────────────────────────────
// Maps sessionId → Set of SSE response writers.

type SseWriter = (event: string, data: unknown) => void
const sseClients = new Map<string, Set<SseWriter>>()

export function registerSseClient(sessionId: string, writer: SseWriter): () => void {
  if (!sseClients.has(sessionId)) sseClients.set(sessionId, new Set())
  sseClients.get(sessionId)!.add(writer)
  return () => {
    sseClients.get(sessionId)?.delete(writer)
    if (sseClients.get(sessionId)?.size === 0) sseClients.delete(sessionId)
  }
}

function broadcast(sessionId: string, event: string, data: unknown) {
  sseClients.get(sessionId)?.forEach((w) => w(event, data))
}

// ─── Datasets ────────────────────────────────────────────────────────────────

export async function listDatasets(): Promise<DatasetRow[]> {
  return all(
    'SELECT id, title, parent_dept, asset_count, uploaded_by, uploaded_at, source FROM inventory_datasets ORDER BY uploaded_at DESC',
  )
}

export async function getDatasetAssets(id: string): Promise<Asset[]> {
  const row = await get('SELECT assets_json FROM inventory_datasets WHERE id = ?', [id])
  if (!row) return []
  return JSON.parse(row.assets_json) as Asset[]
}

export async function upsertDataset(
  id: string,
  title: string,
  parentDept: string,
  assets: Asset[],
  uploadedBy: string,
  source: string,
): Promise<{ id: string; title: string; assetCount: number }> {
  const resolvedId = id || uuidv4()
  await run(
    `INSERT INTO inventory_datasets (id, title, parent_dept, asset_count, assets_json, uploaded_by, uploaded_at, source)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       parent_dept = excluded.parent_dept,
       asset_count = excluded.asset_count,
       assets_json = excluded.assets_json,
       uploaded_by = excluded.uploaded_by,
       uploaded_at = excluded.uploaded_at,
       source = excluded.source`,
    [resolvedId, title, parentDept, assets.length, JSON.stringify(assets), uploadedBy, source],
  )
  return { id: resolvedId, title, assetCount: assets.length }
}

/** 본부별 DB 자산에 재물조사 확인 플래그 업데이트 */
export async function confirmAssetInDataset(
  datasetId: string,
  assetNo: string,
  sessionId: string,
  confirmedBy: string,
): Promise<void> {
  const row = await get('SELECT assets_json FROM inventory_datasets WHERE id = ?', [datasetId])
  if (!row) return
  const assets = JSON.parse(row.assets_json) as Asset[]
  let updated = false
  for (const a of assets) {
    if (a.assetNo === assetNo) {
      a.confirmedInSession = sessionId
      a.confirmedAt = new Date().toISOString()
      a.confirmedBy = confirmedBy
      updated = true
      break
    }
  }
  if (!updated) return
  await run(
    'UPDATE inventory_datasets SET assets_json = ? WHERE id = ?',
    [JSON.stringify(assets), datasetId],
  )
}

// ─── Sessions ────────────────────────────────────────────────────────────────

/** List sessions without results_json (summary only). */
export async function listSessions(): Promise<Omit<SessionRow, 'results_json'>[]> {
  return all(
    'SELECT id, name, dataset_id, parent_dept, dept, created_by, created_at, completed, completed_at, uploaded_at, updated_at FROM inventory_sessions ORDER BY created_at DESC',
  )
}

export async function getSession(id: string): Promise<SessionRow | undefined> {
  return get('SELECT * FROM inventory_sessions WHERE id = ?', [id])
}

export async function createSession(
  name: string,
  datasetId: string,
  parentDept: string,
  dept: string,
  createdBy: string,
): Promise<SessionRow> {
  const id = `sv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  await run(
    `INSERT INTO inventory_sessions (id, name, dataset_id, parent_dept, dept, created_by, results_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '{}', CURRENT_TIMESTAMP)`,
    [id, name.trim(), datasetId, parentDept, dept, createdBy],
  )
  return (await getSession(id))!
}

export async function upsertResult(
  sessionId: string,
  assetNo: string,
  result: object,
  userId: string,
): Promise<{ updatedAt: string }> {
  const session = await getSession(sessionId)
  if (!session) throw new Error('세션을 찾을 수 없습니다.')
  const results = JSON.parse(session.results_json) as Record<string, unknown>
  results[assetNo] = result
  const now = new Date().toISOString()
  await run(
    'UPDATE inventory_sessions SET results_json = ?, completed = 0, completed_at = NULL, updated_at = ? WHERE id = ?',
    [JSON.stringify(results), now, sessionId],
  )
  await run(
    'INSERT INTO inventory_sync_log (session_id, asset_no, action, user_id) VALUES (?, ?, ?, ?)',
    [sessionId, assetNo, 'upsert', userId],
  )
  broadcast(sessionId, 'result_updated', { assetNo, updatedAt: now })
  return { updatedAt: now }
}

export async function deleteResult(
  sessionId: string,
  assetNo: string,
  userId: string,
): Promise<void> {
  const session = await getSession(sessionId)
  if (!session) throw new Error('세션을 찾을 수 없습니다.')
  const results = JSON.parse(session.results_json) as Record<string, unknown>
  delete results[assetNo]
  const now = new Date().toISOString()
  await run(
    'UPDATE inventory_sessions SET results_json = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(results), now, sessionId],
  )
  await run(
    'INSERT INTO inventory_sync_log (session_id, asset_no, action, user_id) VALUES (?, ?, ?, ?)',
    [sessionId, assetNo, 'delete', userId],
  )
  broadcast(sessionId, 'result_deleted', { assetNo })
}

export async function setCompleted(sessionId: string, completed: boolean): Promise<void> {
  await run(
    `UPDATE inventory_sessions SET completed = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [completed ? 1 : 0, completed ? new Date().toISOString() : null, sessionId],
  )
  broadcast(sessionId, 'session_completed', { completed })
}

export async function deleteSession(sessionId: string): Promise<void> {
  await run('DELETE FROM inventory_sessions WHERE id = ?', [sessionId])
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getStats() {
  const rows = (await all(
    'SELECT id, name, dept, parent_dept, completed, created_at, results_json FROM inventory_sessions ORDER BY created_at DESC',
  )) as (Omit<SessionRow, 'results_json' | 'updated_at'> & { results_json: string })[]

  return rows.map((row) => {
    const results = Object.values(JSON.parse(row.results_json)) as Array<{
      confirmed?: boolean
      status?: string
    }>
    const total = results.length
    const confirmed = results.filter((r) => r.confirmed).length
    const abnormal = results.filter((r) => r.status && r.status !== '정상').length
    return {
      id: row.id,
      name: row.name,
      dept: row.dept,
      parentDept: row.parent_dept,
      total,
      confirmed,
      abnormal,
      completed: row.completed === 1,
      createdAt: row.created_at,
    }
  })
}

// ─── Dataset 삭제 ─────────────────────────────────────────────────────────────

/** 이 데이터셋을 마스터로 쓰고 있는 조사 세션 수 */
export async function countSessionsForDataset(datasetId: string): Promise<number> {
  const row = (await get(
    'SELECT COUNT(*) AS n FROM inventory_sessions WHERE dataset_id = ?',
    [datasetId],
  )) as { n: number } | undefined
  return row?.n ?? 0
}

/** 데이터셋 존재 여부 + 표시용 정보 */
export async function getDatasetMetaById(
  datasetId: string,
): Promise<{ id: string; title: string; parentDept: string; assetCount: number } | undefined> {
  const row = (await get(
    'SELECT id, title, parent_dept, asset_count FROM inventory_datasets WHERE id = ?',
    [datasetId],
  )) as { id: string; title: string; parent_dept: string; asset_count: number } | undefined
  if (!row) return undefined
  return { id: row.id, title: row.title, parentDept: row.parent_dept, assetCount: row.asset_count }
}

export async function deleteDataset(datasetId: string): Promise<void> {
  await run('DELETE FROM inventory_datasets WHERE id = ?', [datasetId])
}

// ─── 자산조사 커버리지 통계 ───────────────────────────────────────────────────
//
// 조사 결과 건수만 세던 기존 통계와 달리, **데이터셋의 전체 자산**을 분모로 삼아
// 본부 → 설치부서 → 확인자 순으로 집계합니다. 그래야 100% 조사됐는지 알 수 있습니다.

/** 하이픈·공백을 무시한 자산번호 키 (클라이언트 looseAssetKey와 같은 규칙). */
function looseKey(raw: string): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}
function exactKey(raw: string): string {
  return String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

const NO_DEPT = '(설치부서 없음)'

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
  /** 데이터셋에 없는 자산번호로 저장된 조사 결과 수 (마스터 미조회) */
  offMaster: number
  sessionCount: number
  depts: DeptCoverage[]
}

interface StoredResult {
  assetNo?: string
  confirmed?: boolean
  status?: string
  verifier?: string
  verifierDept?: string
  surveyedAt?: string
}

/** 데이터셋별로 조사 결과를 자산에 매칭한 결과. 통계와 미확인 목록이 공유합니다. */
async function buildCoverage(datasetId?: string): Promise<
  Array<{
    row: { id: string; title: string; parent_dept: string }
    assets: Asset[]
    /** 자산 index → 그 자산에 붙은 조사 결과 (없으면 undefined) */
    hits: Array<StoredResult | undefined>
    offMaster: number
    sessionCount: number
  }>
> {
  const dsRows = (await all(
    datasetId
      ? 'SELECT id, title, parent_dept, assets_json FROM inventory_datasets WHERE id = ?'
      : 'SELECT id, title, parent_dept, assets_json FROM inventory_datasets ORDER BY uploaded_at DESC',
    datasetId ? [datasetId] : [],
  )) as Array<{ id: string; title: string; parent_dept: string; assets_json: string }>

  const sessRows = (await all(
    'SELECT id, dataset_id, results_json FROM inventory_sessions',
  )) as Array<{ id: string; dataset_id: string; results_json: string }>

  const sessionsByDataset = new Map<string, Array<{ id: string; results: StoredResult[] }>>()
  for (const s of sessRows) {
    let results: StoredResult[] = []
    try { results = Object.values(JSON.parse(s.results_json) as Record<string, StoredResult>) } catch { results = [] }
    const list = sessionsByDataset.get(s.dataset_id) ?? []
    list.push({ id: s.id, results })
    sessionsByDataset.set(s.dataset_id, list)
  }

  return dsRows.map((row) => {
    let assets: Asset[] = []
    try { assets = JSON.parse(row.assets_json) as Asset[] } catch { assets = [] }

    // 자산번호 → 자산 인덱스 (정확 키 우선, 하이픈 무시 키는 폴백)
    const index = new Map<string, number>()
    assets.forEach((a, i) => {
      const ex = exactKey(a.assetNo)
      if (ex) index.set(ex, i)
      const lo = looseKey(a.assetNo)
      if (lo && !index.has(lo)) index.set(lo, i)
    })

    const hits: Array<StoredResult | undefined> = new Array(assets.length).fill(undefined)
    let offMaster = 0
    const sessions = sessionsByDataset.get(row.id) ?? []
    for (const s of sessions) {
      for (const r of s.results) {
        const no = r.assetNo ?? ''
        const i = index.get(exactKey(no)) ?? index.get(looseKey(no))
        if (i === undefined) { offMaster++; continue }
        // 여러 세션에서 같은 자산을 조사했으면 나중 조사일이 이깁니다.
        const prev = hits[i]
        if (!prev || (r.surveyedAt ?? '') >= (prev.surveyedAt ?? '')) hits[i] = r
      }
    }

    return { row, assets, hits, offMaster, sessionCount: sessions.length }
  })
}

export async function getCoverageStats(): Promise<DatasetCoverage[]> {
  const built = await buildCoverage()

  return built.map(({ row, assets, hits, offMaster, sessionCount }) => {
    const deptMap = new Map<string, DeptCoverage & { verifierMap: Map<string, VerifierStat> }>()

    assets.forEach((a, i) => {
      const dept = (a.dept ?? '').trim() || NO_DEPT
      let d = deptMap.get(dept)
      if (!d) {
        d = {
          dept, totalAssets: 0, surveyed: 0, confirmed: 0, abnormal: 0, unsurveyed: 0,
          verifiers: [], verifierMap: new Map(),
        }
        deptMap.set(dept, d)
      }
      d.totalAssets++

      const r = hits[i]
      if (!r) { d.unsurveyed++; return }

      d.surveyed++
      const isConfirmed = !!r.confirmed
      const isAbnormal = !!r.status && r.status !== '정상'
      if (isConfirmed) d.confirmed++
      if (isAbnormal) d.abnormal++

      const name = (r.verifier ?? '').trim() || '(확인자 미기재)'
      const vKey = `${name}\u0000${(r.verifierDept ?? '').trim()}`
      let v = d.verifierMap.get(vKey)
      if (!v) {
        v = { verifier: name, verifierDept: (r.verifierDept ?? '').trim(), surveyed: 0, confirmed: 0, abnormal: 0 }
        d.verifierMap.set(vKey, v)
      }
      v.surveyed++
      if (isConfirmed) v.confirmed++
      if (isAbnormal) v.abnormal++
    })

    const depts = [...deptMap.values()]
      .map((d) => ({
        dept: d.dept,
        totalAssets: d.totalAssets,
        surveyed: d.surveyed,
        confirmed: d.confirmed,
        abnormal: d.abnormal,
        unsurveyed: d.unsurveyed,
        verifiers: [...d.verifierMap.values()].sort((a, b) => b.confirmed - a.confirmed || a.verifier.localeCompare(b.verifier, 'ko')),
      }))
      .sort((a, b) => b.totalAssets - a.totalAssets || a.dept.localeCompare(b.dept, 'ko'))

    const sum = (pick: (d: DeptCoverage) => number) => depts.reduce((acc, d) => acc + pick(d), 0)

    return {
      datasetId: row.id,
      title: row.title,
      parentDept: row.parent_dept,
      totalAssets: assets.length,
      surveyed: sum((d) => d.surveyed),
      confirmed: sum((d) => d.confirmed),
      abnormal: sum((d) => d.abnormal),
      unsurveyed: sum((d) => d.unsurveyed),
      offMaster,
      sessionCount,
      depts,
    }
  })
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

/** 아직 조사되지 않은 자산 목록 (데이터셋에는 있으나 결과가 없는 자산). */
export async function getUnsurveyedAssets(opts: {
  datasetId?: string
  dept?: string
  limit: number
  offset: number
}): Promise<{ total: number; assets: UnsurveyedAsset[] }> {
  const built = await buildCoverage(opts.datasetId)
  const wanted = opts.dept?.trim()

  const collected: UnsurveyedAsset[] = []
  for (const { assets, hits } of built) {
    assets.forEach((a, i) => {
      if (hits[i]) return
      const dept = (a.dept ?? '').trim() || NO_DEPT
      if (wanted && dept !== wanted) return
      collected.push({
        assetNo: a.assetNo,
        oldAssetNo: a.oldAssetNo,
        name: a.name,
        model: a.model,
        spec: a.spec,
        acquiredAt: a.acquiredAt,
        serialNo: a.serialNo,
        dept,
        location: a.location,
        manageDept: a.manageDept,
        equipType: a.equipType,
        parentDept: a.parentDept,
      })
    })
  }

  collected.sort((a, b) => a.dept.localeCompare(b.dept, 'ko') || a.assetNo.localeCompare(b.assetNo))
  return {
    total: collected.length,
    assets: collected.slice(opts.offset, opts.offset + opts.limit),
  }
}
