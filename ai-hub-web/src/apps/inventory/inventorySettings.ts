// 재물조사 앱 설정 — localStorage 기반 관리
// 전사 DB 탭 목록과 각 본부별 DB 파일 메타데이터를 저장한다.

const KEY_TABS = 'inventory-settings-tabs'         // 전사 DB 탭 목록
const KEY_DATASETS = 'inventory-settings-datasets' // 업로드된 데이터셋 메타

export interface InventoryTab {
  id: string        // 고유 식별자 (UUID-lite)
  name: string      // 탭 이름 (예: "융합기술본부")
  createdAt: string
}

export interface InventoryDatasetMeta {
  tabId: string
  type: 'company' | 'division' // 전사 DB | 본부별 DB
  datasetId: string             // 서버 inventory_datasets.id
  title: string
  assetCount: number
  uploadedAt: string
  stats?: { total: number; merged: number; surveyOnly: number; erpOnly: number }
}

function genId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

// ── 탭 CRUD ──────────────────────────────────────────────────────────────────

export function readTabs(): InventoryTab[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_TABS) ?? '[]') as InventoryTab[]
  } catch {
    return []
  }
}

export function writeTabs(tabs: InventoryTab[]): void {
  localStorage.setItem(KEY_TABS, JSON.stringify(tabs))
}

export function addTab(name: string): InventoryTab {
  const tab: InventoryTab = { id: genId(), name: name.trim(), createdAt: new Date().toISOString() }
  writeTabs([...readTabs(), tab])
  return tab
}

export function renameTab(id: string, name: string): void {
  writeTabs(readTabs().map((t) => (t.id === id ? { ...t, name: name.trim() } : t)))
}

export function deleteTab(id: string): void {
  writeTabs(readTabs().filter((t) => t.id !== id))
  // cascade: remove dataset metas for this tab
  writeDatasetMetas(readDatasetMetas().filter((d) => d.tabId !== id))
}

export function reorderTabs(ids: string[]): void {
  const map = new Map(readTabs().map((t) => [t.id, t]))
  writeTabs(ids.flatMap((id) => (map.get(id) ? [map.get(id)!] : [])))
}

// ── 데이터셋 메타 CRUD ────────────────────────────────────────────────────────

export function readDatasetMetas(): InventoryDatasetMeta[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_DATASETS) ?? '[]') as InventoryDatasetMeta[]
  } catch {
    return []
  }
}

export function writeDatasetMetas(metas: InventoryDatasetMeta[]): void {
  localStorage.setItem(KEY_DATASETS, JSON.stringify(metas))
}

export function upsertDatasetMeta(meta: InventoryDatasetMeta): void {
  const existing = readDatasetMetas()
  const idx = existing.findIndex((m) => m.tabId === meta.tabId && m.type === meta.type)
  if (idx >= 0) existing[idx] = meta
  else existing.push(meta)
  writeDatasetMetas(existing)
}

export function getDatasetMeta(tabId: string, type: InventoryDatasetMeta['type']): InventoryDatasetMeta | undefined {
  return readDatasetMetas().find((m) => m.tabId === tabId && m.type === type)
}
