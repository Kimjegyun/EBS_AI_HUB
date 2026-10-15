import sqlite3 from 'sqlite3'
import path from 'path'
import fs from 'fs/promises'
import { createHash, randomUUID } from 'crypto'
import { serializeSubmission } from './inventorySubmission'

async function connect() {
  const db = new sqlite3.Database(process.env.DATABASE_PATH || './data/aihub.db')
  db.configure('busyTimeout', 15000)
  const all = (sql: string, values: unknown[] = []) => new Promise<any[]>((resolve, reject) => db.all(sql, values, (error, rows) => error ? reject(error) : resolve(rows)))
  const run = (sql: string, values: unknown[] = []) => new Promise<void>((resolve, reject) => db.run(sql, values, error => error ? reject(error) : resolve()))
  return { all, run, close: () => db.close() }
}
async function snapshot(db: Awaited<ReturnType<typeof connect>>, id: string) {
  const master = (await db.all('SELECT * FROM inventory_survey_forms WHERE id=? AND purged_at IS NULL', [id]))[0]
  if (!master) throw new Error('이미 삭제되었거나 존재하지 않는 자산파일입니다.')
  const datasets = await db.all('SELECT * FROM inventory_datasets WHERE source LIKE ? ORDER BY id', [`survey-form:${id}|%`])
  const sessions = await db.all('SELECT s.* FROM inventory_sessions s JOIN inventory_datasets d ON d.id=s.dataset_id WHERE d.source LIKE ? ORDER BY s.id', [`survey-form:${id}|%`])
  const books = await db.all('SELECT * FROM inventory_submission_books WHERE master_id=? ORDER BY scope', [id])
  const photos = await db.all('SELECT p.* FROM inventory_photos p JOIN inventory_sessions s ON s.id=p.session_id JOIN inventory_datasets d ON d.id=s.dataset_id WHERE d.source LIKE ? ORDER BY p.id', [`survey-form:${id}|%`])
  const files = await db.all(`SELECT * FROM inventory_files WHERE session_id IN (SELECT s.id FROM inventory_sessions s JOIN inventory_datasets d ON d.id=s.dataset_id WHERE d.source LIKE ?) OR id IN (SELECT file_id FROM inventory_submission_books WHERE master_id=?) ORDER BY id`, [`survey-form:${id}|%`, id])
  const erp = await db.all('SELECT * FROM inventory_erp_files WHERE dataset_id IN (SELECT id FROM inventory_datasets WHERE source LIKE ?)', [`survey-form:${id}|%`])
  const token = createHash('sha256').update(JSON.stringify([master, datasets, sessions, books, photos, files, erp])).digest('hex')
  const preview = { id, fileName: master.file_name, uploadedAt: master.uploaded_at, retired: !!master.retired_at,
    datasetCount: datasets.length, assetCount: datasets.reduce((n, d) => n + d.asset_count, 0), sessionCount: sessions.length,
    resultCount: sessions.reduce((n, s) => n + Object.keys(JSON.parse(s.results_json || '{}')).length, 0), photoCount: photos.length, fileCount: files.length, token }
  return { master, datasets, sessions, books, photos, files, erp, preview }
}
// Older versions stored the 운영관리부 submission as files (kind 'dept-comparison',
// plus timestamped `${id}-*.xlsx` versions). The submission is now generated on
// demand from inventory_submission_assets, so any such file is an orphan.
async function legacySubmissionFiles(db: Awaited<ReturnType<typeof connect>>) {
  const rows = await db.all(`SELECT * FROM inventory_files WHERE kind='dept-comparison'
    AND id NOT IN (SELECT file_id FROM inventory_submission_books WHERE file_id IS NOT NULL) ORDER BY id`)
  const names = await fs.readdir(path.resolve('uploads', 'inventory')).catch(() => [] as string[])
  const files = new Set<string>()
  for (const row of rows) {
    files.add(row.stored_name)
    for (const name of names) if (name.startsWith(`${row.id}-`) && name.endsWith('.xlsx')) files.add(name)
  }
  return { ids: rows.map(row => String(row.id)), files: [...files].filter(name => name && path.basename(name) === name) }
}

/** Removes orphaned legacy submission files once at startup; returns how many files were deleted. */
export async function removeLegacySubmissionFiles() {
  return serializeSubmission(async () => {
    const db = await connect()
    try {
      const legacy = await legacySubmissionFiles(db)
      if (!legacy.ids.length && !legacy.files.length) return 0
      for (const id of legacy.ids) await db.run('DELETE FROM inventory_files WHERE id=?', [id])
      let removed = 0
      for (const name of legacy.files) await fs.unlink(path.resolve('uploads', 'inventory', name)).then(() => { removed++ }).catch(() => {})
      return removed
    } finally { db.close() }
  })
}

export async function listMasterFiles(id?: string) {
  const db = await connect()
  try {
    const rows = id ? [{ id }] : await db.all('SELECT id FROM inventory_survey_forms WHERE purged_at IS NULL ORDER BY rowid DESC')
    return await Promise.all(rows.map(async row => (await snapshot(db, row.id)).preview))
  } finally { db.close() }
}
export async function purgeMasterFile(id: string, token: string) {
  return serializeSubmission(async () => {
    const db = await connect()
    const root = path.resolve('uploads')
    const staging = path.join(root, `.delete-${randomUUID()}`)
    const moved: Array<{ original: string; staged: string }> = []
    let committed = false
    try {
      await db.run('BEGIN IMMEDIATE')
      const state = await snapshot(db, id)
      if (!token || token !== state.preview.token) throw new Error('확인 후 데이터가 변경되었습니다. 목록을 새로고침하고 삭제 범위를 다시 확인해 주세요.')
      const paths = new Set<string>()
      const add = (dir: string, name: string) => {
        if (!name || path.basename(name) !== name || /[\\/]/.test(name)) throw new Error('안전하지 않은 저장 파일 경로입니다.')
        const target = path.resolve(root, dir, name)
        if (!target.startsWith(root + path.sep)) throw new Error('저장 경로를 확인할 수 없습니다.')
        paths.add(target)
      }
      add('inventory-survey', state.master.stored_name)
      state.photos.forEach(row => add('inventory-photos', row.stored_name))
      state.files.forEach(row => add('inventory', row.stored_name))
      state.erp.forEach(row => add('inventory-erp', row.stored_name))
      const versions = await fs.readdir(path.join(root, 'inventory')).catch(() => [])
      for (const book of state.books) if (book.file_id) for (const name of versions) if (name.startsWith(`${book.file_id}-`) && name.endsWith('.xlsx')) add('inventory', name)
      // Deleting a master also clears legacy submission files so no stale 반영본 survives it.
      const legacy = await legacySubmissionFiles(db)
      legacy.files.forEach(name => add('inventory', name))
      await fs.mkdir(staging, { recursive: true })
      for (const original of paths) {
        const staged = path.join(staging, String(moved.length))
        try { await fs.rename(original, staged); moved.push({ original, staged }) }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      }
      for (const session of state.sessions) {
        for (const table of ['inventory_photos', 'inventory_sync_log', 'inventory_files']) await db.run(`DELETE FROM ${table} WHERE session_id=?`, [session.id])
        await db.run('DELETE FROM inventory_sessions WHERE id=?', [session.id])
      }
      for (const dataset of state.datasets) {
        await db.run('DELETE FROM inventory_erp_files WHERE dataset_id=?', [dataset.id])
        await db.run('DELETE FROM inventory_datasets WHERE id=?', [dataset.id])
      }
      for (const book of state.books) {
        await db.run('DELETE FROM inventory_files WHERE id=?', [book.file_id])
        for (const table of ['inventory_submission_assets', 'inventory_submission_audit']) await db.run(`DELETE FROM ${table} WHERE scope=?`, [book.scope])
      }
      await db.run('DELETE FROM inventory_submission_books WHERE master_id=?', [id])
      for (const fileId of legacy.ids) await db.run('DELETE FROM inventory_files WHERE id=?', [fileId])
      // A tombstone prevents older registrations from silently becoming current again.
      await db.run('UPDATE inventory_survey_forms SET retired_at=COALESCE(retired_at,?),purged_at=? WHERE id=?', [new Date().toISOString(), new Date().toISOString(), id])
      await db.run('COMMIT')
      committed = true
      let cleanupPending = false
      for (const file of moved) await fs.unlink(file.staged).catch(() => { cleanupPending = true })
      await fs.rmdir(staging).catch(() => { cleanupPending = true })
      return { ok: true, datasetIds: state.datasets.map(row => row.id), cleanupPending }
    } catch (error) {
      if (!committed) {
        await db.run('ROLLBACK').catch(() => {})
        for (const file of [...moved].reverse()) await fs.rename(file.staged, file.original)
        await fs.rmdir(staging).catch(() => {})
      }
      throw error
    } finally { db.close() }
  })
}
