// Loads and caches the asset master dataset. On first use it fetches the bundled
// JSON from /datasets (or the server API) and stores it in IndexedDB so the app
// works offline on a phone afterwards. No local Excel file is required.

import { idbGet, idbPut, idbDelete, STORE_DATASETS } from './idb'
import { DATASET_SOURCES, type Asset, type AssetDataset, type DatasetSource } from './types'
import { fetchServerDatasets, fetchServerAssets, fetchSurveyForm, isServerReachable } from './inventoryApiClient'

export function isDepartmentSheet(name: string): boolean {
  return ![/^전사$/i, /^목차$/i, /^안내$/i, /^작성방법$/i, /^상위부서/i, /raw\s*data/i, /재물조사대상/i]
    .some((pattern) => pattern.test(name.trim()))
}

/** The uploaded workbook defines department names and their order. */
export async function getWorkbookCatalog(): Promise<{ departments: string[]; sources: DatasetSource[] }> {
  if (!await isServerReachable()) throw new Error('등록된 엑셀의 탭을 불러올 수 없습니다. 서버 연결을 확인해 주세요.')
  const [form, datasets] = await Promise.all([fetchSurveyForm(true), fetchServerDatasets(true)])
  if (!form) return { departments: [], sources: [] }
  const departments = form.sheetNames.filter(isDepartmentSheet)
  const sources = departments.flatMap((name) => datasets
    .filter((dataset) => dataset.parentDept === name && dataset.source?.startsWith(`survey-form:${form.id}|`))
    .map((dataset) => ({
      id: dataset.id, title: name, parentDept: name, url: '',
      assetCount: dataset.assetCount, uploadedAt: dataset.uploadedAt, sourceFileName: form.fileName,
      departments: dataset.departments,
    })))
  return { departments, sources }
}

const memCache = new Map<string, { dataset: AssetDataset; index: Map<string, Asset> }>()

export async function forgetDataset(id: string): Promise<void> {
  memCache.delete(id)
  await idbDelete(STORE_DATASETS, id)
}

export const normalizeAssetNo = (raw: string): string => raw.trim().toUpperCase().replace(/\s+/g, '')

/**
 * 하이픈·공백 등 구분자를 모두 뺀 비교용 키.
 *
 * 자산 라벨 QR은 자산번호를 하이픈 없이 내보내지만(QQ000120240000) ERP·마스터
 * 데이터에는 하이픈이 들어 있어(QQ00012-0240-000) 그대로 비교하면 어긋납니다.
 * 그래서 양쪽 모두 이 키로 한 번 더 대조합니다.
 *
 * normalizeAssetNo를 직접 바꾸지 않는 이유: 그 값이 조사 결과(session.results)의
 * 저장 키로 이미 쓰이고 있어, 규칙을 바꾸면 기존에 조사한 자산을 못 찾게 됩니다.
 */
export const looseAssetKey = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** 정확 키를 먼저 넣고, 비어 있는 느슨한 키 자리에만 폴백을 채웁니다. */
function addToIndex<T>(index: Map<string, T>, assetNo: string, value: T, overwrite = true): void {
  const exact = normalizeAssetNo(assetNo)
  if (!exact) return
  if (overwrite || !index.has(exact)) index.set(exact, value)
  const loose = looseAssetKey(assetNo)
  if (loose && (overwrite || !index.has(loose))) index.set(loose, value)
}

/** 정확 일치 → 하이픈 무시 순으로 색인을 조회합니다. */
export function indexLookup<T>(index: Map<string, T>, assetNo: string): T | undefined {
  return index.get(normalizeAssetNo(assetNo)) ?? index.get(looseAssetKey(assetNo))
}

function buildIndex(dataset: AssetDataset): Map<string, Asset> {
  const index = new Map<string, Asset>()
  // 신형 자산번호를 우선 등록한 뒤 구형 자산번호를 별칭으로 등록합니다.
  // 바코드가 구형 번호를 반환해도 동일한 마스터 자산을 찾되, 두 자산의
  // 번호가 우연히 겹치는 경우에는 현재 자산번호가 항상 우선합니다.
  for (const a of dataset.assets) addToIndex(index, a.assetNo, a)
  for (const a of dataset.assets) {
    if (a.oldAssetNo) addToIndex(index, a.oldAssetNo, a, false)
  }
  return index
}

export function getDatasetSource(id: string): DatasetSource | undefined {
  return DATASET_SOURCES.find((d) => d.id === id)
}

/**
 * Returns the merged list of local (bundled) + server datasets.
 * Falls back to local-only when server is unreachable.
 */
export async function getAllDatasetSources(): Promise<DatasetSource[]> {
  try {
    const reachable = await isServerReachable()
    if (!reachable) return []
    const serverMetas = await fetchServerDatasets()
    return serverMetas
      .map((m) => ({
        id: m.id, title: m.title, url: '', parentDept: m.parentDept,
        assetCount: m.assetCount,
        uploadedAt: m.uploadedAt,
        sourceFileName: m.source?.includes('|file:')
          ? m.source.slice(m.source.indexOf('|file:') + '|file:'.length)
          : undefined,
      }))
  } catch {
    return []
  }
}

/**
 * Ensure a dataset is available locally. Returns it from memory → IndexedDB →
 * network (then caches to IndexedDB). `onProgress` reports the load phase.
 */
export async function ensureDataset(
  id: string,
  onProgress?: (phase: 'cache' | 'download' | 'ready') => void,
  forceRefresh = false,
): Promise<{ dataset: AssetDataset; index: Map<string, Asset> }> {
  // forceRefresh면 메모리 캐시 무효화 (재물조사 시작 시)
  if (forceRefresh) memCache.delete(id)

  const mem = memCache.get(id)
  if (mem) return mem

  const src = getDatasetSource(id)
  const reachable = await isServerReachable()

  // 서버가 살아있으면 항상 서버에서 최신 데이터를 받음
  // (confirmedInSession 등 실시간 반영을 위해)
  if (reachable) {
    onProgress?.('download')
    try {
      const assets = (await fetchServerAssets(id)) as Asset[]
      const dataset: AssetDataset = {
        meta: {
          id, title: src?.title ?? id, parentDept: src?.parentDept ?? '',
          source: 'server', sheet: '', generatedAt: new Date().toISOString(),
          count: assets.length,
        },
        assets,
      }
      await idbPut(STORE_DATASETS, dataset).catch(() => {})
      const entry = { dataset, index: buildIndex(dataset) }
      memCache.set(id, entry)
      onProgress?.('ready')
      return entry
    } catch {
      // 서버 실패 → IndexedDB 폴백
    }
  }

  // 오프라인: IndexedDB 캐시 사용
  const cached = await idbGet<AssetDataset>(STORE_DATASETS, id).catch(() => undefined)
  if (cached && cached.assets?.length) {
    onProgress?.('cache')
    const entry = { dataset: cached, index: buildIndex(cached) }
    memCache.set(id, entry)
    onProgress?.('ready')
    return entry
  }

  // 최후 폴백: 번들된 JSON
  if (!src?.url) throw new Error(`알 수 없는 데이터셋 (오프라인): ${id}`)
  onProgress?.('download')
  const res = await fetch(src.url)
  if (!res.ok) throw new Error(`데이터셋 다운로드 실패 (${res.status})`)
  const raw = (await res.json()) as AssetDataset
  const dataset: AssetDataset = {
    meta: {
      id, title: src.title, parentDept: src.parentDept,
      source: src.url, sheet: '', generatedAt: new Date().toISOString(),
      count: raw.assets.length,
    },
    assets: raw.assets,
  }
  await idbPut(STORE_DATASETS, dataset).catch(() => {})
  const entry = { dataset, index: buildIndex(dataset) }
  memCache.set(id, entry)
  onProgress?.('ready')
  return entry
}

/** Look up an asset by (possibly noisy) asset number within a loaded dataset. */
export function lookupAsset(id: string, assetNo: string): Asset | undefined {
  const index = memCache.get(id)?.index
  return index ? indexLookup(index, assetNo) : undefined
}

export function getLoadedDataset(id: string): AssetDataset | undefined {
  return memCache.get(id)?.dataset
}

/** Has the dataset been downloaded & cached locally already? */
export async function isDatasetCached(id: string): Promise<boolean> {
  if (memCache.has(id)) return true
  const cached = await idbGet<AssetDataset>(STORE_DATASETS, id).catch(() => undefined)
  return !!(cached && cached.assets?.length)
}

// ── 운영관리부 배부 본부(탭) 목록 ─────────────────────────────────────────────
// 최신 전사 엑셀의 본부 시트 순서를 관리자 화면과 현장 앱에서 함께 사용합니다.
// 오프라인에서는 마지막으로 서버에서 확인한 탭 목록을 사용합니다.
const ORGS_CACHE_KEY = 'inventory-distributed-orgs'
const ORG_DEPARTMENTS_CACHE_KEY = 'inventory-org-departments'

/** 마지막으로 받아둔 배부 본부 목록 (오프라인 폴백). */
export function readCachedOrgs(): string[] {
  try {
    const raw = localStorage.getItem(ORGS_CACHE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function readCachedOrgDepartments(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(ORG_DEPARTMENTS_CACHE_KEY) || '{}') as Record<string, string[]>
  } catch {
    return {}
  }
}

/**
 * 배부된 본부(탭) 목록과 본부별 부서(자산 마스터의 설치부서) 목록을 반환합니다.
 * 서버가 닿으면 최신 목록을 받아 캐시하고, 오프라인이면 마지막 캐시를 사용합니다.
 */
export async function getDistributedOrgs(): Promise<{ orgs: string[]; fromCache: boolean; departmentsByOrg: Record<string, string[]> }> {
  try {
    const { departments: orgs, sources } = await getWorkbookCatalog()
    const departmentsByOrg = Object.fromEntries(sources.map((source) => [source.parentDept, source.departments ?? []]))
    try {
      localStorage.setItem(ORGS_CACHE_KEY, JSON.stringify(orgs))
      localStorage.setItem(ORG_DEPARTMENTS_CACHE_KEY, JSON.stringify(departmentsByOrg))
    } catch {
      /* 저장 실패는 무시 — 목록 자체는 그대로 사용 */
    }
    return { orgs, fromCache: false, departmentsByOrg }
  } catch {
    /* 네트워크 오류 → 캐시 폴백 */
  }
  return { orgs: readCachedOrgs(), fromCache: true, departmentsByOrg: readCachedOrgDepartments() }
}
