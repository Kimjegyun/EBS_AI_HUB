// Loads and caches the asset master dataset. On first use it fetches the bundled
// JSON from /datasets (or the server API) and stores it in IndexedDB so the app
// works offline on a phone afterwards. No local Excel file is required.

import { idbGet, idbPut, STORE_DATASETS } from './idb'
import { DATASET_SOURCES, type Asset, type AssetDataset, type DatasetSource } from './types'
import { fetchServerDatasets, fetchServerAssets, isServerReachable } from './inventoryApiClient'

const memCache = new Map<string, { dataset: AssetDataset; index: Map<string, Asset> }>()

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
function addToIndex<T>(index: Map<string, T>, assetNo: string, value: T): void {
  const exact = normalizeAssetNo(assetNo)
  if (!exact) return
  index.set(exact, value)
  const loose = looseAssetKey(assetNo)
  if (loose && !index.has(loose)) index.set(loose, value)
}

/** 정확 일치 → 하이픈 무시 순으로 색인을 조회합니다. */
export function indexLookup<T>(index: Map<string, T>, assetNo: string): T | undefined {
  return index.get(normalizeAssetNo(assetNo)) ?? index.get(looseAssetKey(assetNo))
}

function buildIndex(dataset: AssetDataset): Map<string, Asset> {
  const index = new Map<string, Asset>()
  for (const a of dataset.assets) addToIndex(index, a.assetNo, a)
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
  const local = [...DATASET_SOURCES]
  try {
    const reachable = await isServerReachable()
    if (!reachable) return local
    const serverMetas = await fetchServerDatasets()
    const localIds = new Set(local.map((d) => d.id))
    const serverSources: DatasetSource[] = serverMetas
      .filter((m) => !localIds.has(m.id))
      .map((m) => ({ id: m.id, title: m.title, url: '', parentDept: m.parentDept }))
    return [...local, ...serverSources]
  } catch {
    return local
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
// 관리자가 운영관리부 양식의 시트(=본부)를 탭으로 등록하고 ERP 파일을 병합하면
// 서버에 본부별 dataset이 생깁니다. 그 dataset의 parentDept가 곧 배부된 탭 이름이므로,
// 사용자 앱의 '소속' 선택지는 이 목록에서 가져옵니다.
// (탭 목록 자체는 관리자 브라우저 localStorage에만 있어 폰에서는 볼 수 없습니다 —
//  서버 데이터셋이 폰이 접근할 수 있는 유일한 출처입니다)
const ORGS_CACHE_KEY = 'inventory-distributed-orgs'

function uniqueSortedOrgs(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ko'),
  )
}

/** 마지막으로 받아둔 배부 본부 목록 (오프라인 폴백). */
export function readCachedOrgs(): string[] {
  try {
    const raw = localStorage.getItem(ORGS_CACHE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

/**
 * 배부된 본부(탭) 목록을 반환합니다.
 * 서버가 닿으면 최신 목록을 받아 캐시하고, 오프라인이면 마지막 캐시를 사용합니다.
 */
export async function getDistributedOrgs(): Promise<{ orgs: string[]; fromCache: boolean }> {
  try {
    if (await isServerReachable()) {
      const metas = await fetchServerDatasets()
      const orgs = uniqueSortedOrgs([
        ...DATASET_SOURCES.map((d) => d.parentDept),
        ...metas.map((m) => m.parentDept),
      ])
      if (orgs.length) {
        try {
          localStorage.setItem(ORGS_CACHE_KEY, JSON.stringify(orgs))
        } catch {
          /* 저장 실패는 무시 — 목록 자체는 그대로 사용 */
        }
        return { orgs, fromCache: false }
      }
    }
  } catch {
    /* 네트워크 오류 → 캐시 폴백 */
  }
  return { orgs: readCachedOrgs(), fromCache: true }
}
