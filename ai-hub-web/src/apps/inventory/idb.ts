// Tiny IndexedDB wrapper (no external deps) for the 재물조사 app. Stores the cached
// master datasets (~MBs, too large for localStorage) and survey sessions.

import { getCurrentUserStorageId } from '../../lib/userScopedStorage'

const DB_NAME = 'jaemul-db'
const DB_VERSION = 4
export const STORE_DATASETS = 'datasets'
export const STORE_SESSIONS = 'sessions'
export const STORE_PHOTOS = 'photos'
export const STORE_SYNC_QUEUE = 'sync_queue'
// 사용자가 로컬로 올린 ERP 자산현황 파일 (마스터 미조회 자산의 자산명 대조용)
export const STORE_ERP = 'erp_assets'

let dbPromise: Promise<IDBDatabase> | null = null
let activeDbName: string | null = null

function getDbName(): string {
  return `${DB_NAME}:${getCurrentUserStorageId()}`
}

function openDb(): Promise<IDBDatabase> {
  const dbName = getDbName()
  if (activeDbName !== dbName) {
    dbPromise = null
    activeDbName = dbName
  }
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_DATASETS)) {
        db.createObjectStore(STORE_DATASETS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
        db.createObjectStore(STORE_PHOTOS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
        db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_ERP)) {
        db.createObjectStore(STORE_ERP, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        req.onsuccess = () => resolve(req.result as T)
        req.onerror = () => reject(req.error)
      }),
  )
}

export const idbGet = <T>(store: string, key: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(key))
export const idbPut = <T>(store: string, value: T) => tx<IDBValidKey>(store, 'readwrite', (s) => s.put(value as unknown as object))
export const idbDelete = (store: string, key: string) => tx<undefined>(store, 'readwrite', (s) => s.delete(key))
export const idbGetAll = <T>(store: string) => tx<T[]>(store, 'readonly', (s) => s.getAll())
