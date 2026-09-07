export type StoredVoiceProject = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  transcript: string
  summaryText: string
  summaryJson?: string
  files: Array<{ name: string; type: string; lastModified: number; createdAt: number; blob: Blob }>
}

const DB_NAME = 'ebs-ai-hub-voice-summary'
const STORE = 'projects'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

export async function listVoiceProjects(): Promise<StoredVoiceProject[]> {
  const rows = await run<StoredVoiceProject[]>('readonly', (store) => store.getAll())
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getVoiceProject(id: string): Promise<StoredVoiceProject | undefined> {
  return run('readonly', (store) => store.get(id))
}

export async function saveVoiceProject(project: StoredVoiceProject): Promise<void> {
  await run('readwrite', (store) => store.put(project))
}

export async function deleteVoiceProject(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id))
}
