// ERP 자산현황 엑셀(로컬 업로드) 대조 인덱스.
//
// QR로 찍은 자산번호가 서버 마스터 데이터셋에 없을 때, 사용자가 올려둔 ERP
// 파일에서 자산명·모델·규격·설치장소를 찾아 조사 초안에 자동으로 채웁니다.
// 파일은 IndexedDB에만 저장되고 서버로 전송되지 않으므로 오프라인에서도 동작합니다.

import { idbGet, idbPut, idbDelete, STORE_ERP } from './idb'
import { parseErpFile } from './excelService'
import { indexLookup, looseAssetKey, normalizeAssetNo } from './datasetService'
import type { ErpAsset } from './types'
import { downloadErpFileBlob, fetchErpFileMeta } from './inventoryApiClient'

const ERP_KEY = 'erp'

export interface ErpStore {
  id: string
  fileName: string
  sheetName: string
  importedAt: string
  assets: ErpAsset[]
  /** 원본 xlsx 바이트 — 검수 열을 앞에 덧붙인 파일을 원본 서식 그대로 다시 만들 때 사용 */
  fileData: ArrayBuffer
  /** 서버에서 자동으로 받아온 파일이면 그 파일 id. 직접 올린 파일이면 없음. */
  serverFileId?: string
}

let cache: { store: ErpStore; index: Map<string, ErpAsset> } | null = null

function buildIndex(assets: ErpAsset[]): Map<string, ErpAsset> {
  const index = new Map<string, ErpAsset>()
  // 자산번호를 먼저 전부 넣어, 구자산번호와 키가 겹치면 자산번호 쪽이 남게 합니다.
  for (const a of assets) addKeys(index, a.assetNo, a)
  for (const a of assets) if (a.oldAssetNo) addKeys(index, a.oldAssetNo, a)
  return index
}

/** 정확 키와 하이픈 무시 키를 함께 등록 (이미 있는 키는 덮어쓰지 않음). */
function addKeys(index: Map<string, ErpAsset>, assetNo: string, value: ErpAsset): void {
  const exact = normalizeAssetNo(assetNo)
  if (exact && !index.has(exact)) index.set(exact, value)
  const loose = looseAssetKey(assetNo)
  if (loose && !index.has(loose)) index.set(loose, value)
}

/** IndexedDB에 저장해 둔 ERP 파일을 메모리로 올립니다. 없으면 null. */
export async function loadErpIndex(): Promise<ErpStore | null> {
  if (cache) return cache.store
  const store = await idbGet<ErpStore>(STORE_ERP, ERP_KEY).catch(() => undefined)
  if (!store?.assets?.length) return null
  cache = { store, index: buildIndex(store.assets) }
  return store
}

/** ERP 엑셀 파일을 파싱해 저장하고 색인을 갱신합니다. */
export async function importErpFile(file: File, serverFileId?: string): Promise<ErpStore> {
  const buffer = await file.arrayBuffer()
  const { assets, sheetName } = parseErpFile(buffer)
  if (!assets.length) throw new Error('자산 행을 찾지 못했습니다.')
  const store: ErpStore = {
    id: ERP_KEY,
    fileName: file.name,
    sheetName,
    importedAt: new Date().toISOString(),
    assets,
    fileData: buffer,
    serverFileId,
  }
  await idbPut(STORE_ERP, store)
  cache = { store, index: buildIndex(assets) }
  return store
}

export async function clearErpFile(): Promise<void> {
  cache = null
  await idbDelete(STORE_ERP, ERP_KEY).catch(() => {})
}

/**
 * 자산번호(또는 구자산번호)로 ERP 레코드를 찾습니다.
 * loadErpIndex() 또는 importErpFile() 이후에만 결과가 나옵니다.
 */
export function lookupErp(assetNo: string): ErpAsset | undefined {
  return cache ? indexLookup(cache.index, assetNo) : undefined
}

/**
 * 관리자가 서버에 등록해 둔 본부 ERP 원본을 받아 색인합니다.
 *
 * 조사자가 폰에서 ERP 파일을 따로 첨부하지 않아도 되도록, 세션을 열 때 자동으로
 * 호출합니다. 같은 파일을 이미 넣어 뒀으면 다시 받지 않습니다.
 */
export async function syncErpFromServer(
  parentDept: string,
): Promise<{ store: ErpStore | null; status: 'loaded' | 'already' | 'none' | 'failed' }> {
  const meta = await fetchErpFileMeta(parentDept)
  if (!meta) return { store: await loadErpIndex(), status: 'none' }

  const current = await loadErpIndex()
  // 같은 서버 파일을 이미 반영해 뒀으면 다시 받지 않습니다.
  if (current?.serverFileId === meta.id) return { store: current, status: 'already' }

  const blob = await downloadErpFileBlob(meta.id)
  if (!blob) return { store: current, status: 'failed' }

  try {
    const file = new File([blob], meta.fileName, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const store = await importErpFile(file, meta.id)
    return { store, status: 'loaded' }
  } catch {
    return { store: current, status: 'failed' }
  }
}
