import sqlite3 from 'sqlite3'
import fs from 'fs/promises'
import path from 'path'
import { notifySubmission } from './inventoryEvents'

type Row = Record<string, any>
const key = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '')
const yearOf = (session: Row) => session.name.match(/20\d{2}/)?.[0] || session.created_at.slice(0, 4)
let chain: Promise<unknown> = Promise.resolve()
export function serializeSubmission<T>(fn: () => Promise<T>): Promise<T> {
  const task = chain.catch(() => {}).then(fn)
  chain = task.catch(() => {})
  return task
}
async function connection() {
  const db = new sqlite3.Database(process.env.DATABASE_PATH || './data/aihub.db')
  db.configure('busyTimeout', 15000)
  const run = (sql: string, params: unknown[] = []) => new Promise<void>((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()))
  const all = (sql: string, params: unknown[] = []) => new Promise<Row[]>((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows as Row[])))
  const get = async (sql: string, params: unknown[] = []) => (await all(sql, params))[0]
  await run(`CREATE TABLE IF NOT EXISTS inventory_submission_assets (
    scope TEXT NOT NULL, parent_dept TEXT NOT NULL, asset_key TEXT NOT NULL,
    result_json TEXT NOT NULL, revision INTEGER NOT NULL, session_id TEXT NOT NULL,
    PRIMARY KEY(scope, parent_dept, asset_key))`)
  await run(`CREATE TABLE IF NOT EXISTS inventory_submission_books (
    scope TEXT PRIMARY KEY, master_id TEXT NOT NULL, year TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending', file_id TEXT, error TEXT,
    generated_at TEXT, unmatched INTEGER NOT NULL DEFAULT 0)`)
  await run(`CREATE TABLE IF NOT EXISTS inventory_submission_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT, asset_key TEXT,
    actor TEXT, previous_json TEXT, result_json TEXT, changed_at TEXT)`)
  return { run, all, get, close: () => db.close() }
}
async function scopeFor(db: Awaited<ReturnType<typeof connection>>, sessionId: string) {
  const session = await db.get('SELECT * FROM inventory_sessions WHERE id = ?', [sessionId])
  if (!session) throw new Error('조사 세션을 찾을 수 없습니다. 목록을 새로고침해 주세요.')
  const dataset = await db.get('SELECT source FROM inventory_datasets WHERE id = ?', [session.dataset_id])
  const masterId = dataset?.source?.match(/survey-form:([^|]+)/)?.[1]
  if (!masterId) throw new Error('운영관리부 마스터와 연결된 조사에서 시작해 주세요.')
  const master = await db.get('SELECT * FROM inventory_survey_forms WHERE id = ?', [masterId])
  if (!master) throw new Error('이 조사의 마스터 원본이 없습니다. 관리자에게 문의해 주세요.')
  return { session, master, year: yearOf(session), scope: `${masterId}:${yearOf(session)}` }
}

// Only business fields participate in idempotency; retries and local photo IDs do not.
const fields = ['assetNo', 'name', 'dept', 'location', 'model', 'spec', 'status', 'stickerMissing', 'note', 'confirmed', 'verifier', 'verifierDept', 'surveyedAt', 'matched', 'userDept', 'serverPhotoIds', 'photoKeys']
function clean(input: Row): Row {
  const output: Row = {}
  for (const field of fields) if (input[field] !== undefined) output[field] = input[field]
  return output
}
function equivalent(a: Row, b: Row) {
  return fields.every(field => field === 'serverPhotoIds' || (field === 'assetNo' ? key(a.assetNo) === key(b.assetNo) : JSON.stringify(a[field] ?? (field === 'photoKeys' ? [] : '')) === JSON.stringify(b[field] ?? (field === 'photoKeys' ? [] : ''))))
}

// Import previously saved records once, without losing work from before this workflow.
async function initializeScope(db: Awaited<ReturnType<typeof connection>>, info: Awaited<ReturnType<typeof scopeFor>>) {
  if (await db.get('SELECT scope FROM inventory_submission_books WHERE scope = ?', [info.scope])) return
  await db.run('INSERT INTO inventory_submission_books(scope, master_id, year) VALUES (?, ?, ?)', [info.scope, info.master.id, info.year])
  const sessions = await db.all(`SELECT s.* FROM inventory_sessions s JOIN inventory_datasets d ON d.id=s.dataset_id WHERE d.source LIKE ?`, [`survey-form:${info.master.id}|%`])
  for (const session of sessions.filter(s => yearOf(s) === info.year)) {
    for (const raw of Object.values(JSON.parse(session.results_json)) as Row[]) {
      if (!raw.confirmed || !raw.assetNo) continue
      const result = clean(raw)
      const previous = await db.get('SELECT result_json FROM inventory_submission_assets WHERE scope=? AND parent_dept=? AND asset_key=?', [info.scope, session.parent_dept, key(result.assetNo)])
      if (previous && JSON.parse(previous.result_json).surveyedAt >= result.surveyedAt) continue
      await db.run(`INSERT INTO inventory_submission_assets VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(scope,parent_dept,asset_key) DO UPDATE SET result_json=excluded.result_json,session_id=excluded.session_id`,
      [info.scope, session.parent_dept, key(result.assetNo), JSON.stringify(result), session.id])
    }
  }
}

async function generate(db: Awaited<ReturnType<typeof connection>>, info: Awaited<ReturnType<typeof scopeFor>>) {
  const rows = await db.get('SELECT COUNT(*) AS total FROM inventory_submission_assets WHERE scope=?', [info.scope])
  const generatedAt = new Date().toISOString()
  await db.run("UPDATE inventory_submission_books SET state='ready',file_id=NULL,error=NULL,generated_at=?,unmatched=0 WHERE scope=?", [generatedAt, info.scope])
  return { status: 'ready' as const, generatedAt, unmatched: 0, applied: Number(rows.total) }
}

export async function exportConfirmedResults(year: string) {
  if (!/^20\d{2}$/.test(year)) throw new Error('Invalid survey year')
  const db = await connection()
  try {
    const master = await db.get('SELECT * FROM inventory_survey_forms ORDER BY rowid DESC LIMIT 1')
    if (!master || master.retired_at || master.purged_at) throw new Error('No current asset master')
    const stored = await db.all('SELECT parent_dept,result_json FROM inventory_submission_assets WHERE scope=? ORDER BY parent_dept,asset_key', [master.id+':'+year])
    return stored.map(row => ({ ...JSON.parse(row.result_json), parentDept: row.parent_dept })).filter(row => row.confirmed === true)
  } finally { db.close() }
}

/**
 * 전사 재물조사 workbook: the current 운영관리부 master with every 본부 sheet filled
 * from the merged server results (조사부서·조사자·조사일시·확인완료). Built on demand,
 * never stored, so it always matches the per-본부/부서/입력자 exports.
 */
export async function buildCompanyWorkbook(year: string) {
  if (!/^20\d{2}$/.test(year)) throw new Error('조사연도를 네 자리로 입력해 주세요.')
  const db = await connection()
  try {
    const master = await db.get('SELECT * FROM inventory_survey_forms ORDER BY rowid DESC LIMIT 1')
    if (!master || master.retired_at || master.purged_at) throw new Error('현재 등록된 운영관리부 마스터가 없습니다.')
    const rows = await db.all('SELECT parent_dept, result_json FROM inventory_submission_assets WHERE scope=? ORDER BY parent_dept, asset_key', [`${master.id}:${year}`])
    // One pseudo-session per 본부 so the shared builder fills the matching sheet.
    const byDept = new Map<string, Row>()
    for (const row of rows) {
      const result = JSON.parse(row.result_json)
      if (result.confirmed !== true) continue
      const session = byDept.get(row.parent_dept) ?? { id: row.parent_dept, name: `${year}년 재물조사`, parentDept: row.parent_dept, createdAt: `${year}-01-01`, createdBy: '', dept: '', results: {} }
      session.results[result.assetNo] = result
      byDept.set(row.parent_dept, session)
    }
    const source = await fs.readFile(path.join(process.cwd(), 'uploads/inventory-survey', master.stored_name))
    const { buildSubmissionWorkbook } = await import('./submissionWorkbook')
    const built = await buildSubmissionWorkbook(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer, [...byDept.values()] as never, year)
    return {
      buffer: Buffer.from(await built.blob.arrayBuffer()),
      fileName: `${year}_전사_재물조사.xlsx`,
      confirmed: [...byDept.values()].reduce((n, s) => n + Object.keys(s.results).length, 0),
      headquarters: byDept.size,
      unmatched: built.unmatched,
    }
  } finally { db.close() }
}

export async function submitConfirmed(sessionId: string, inputs: Row[], actor: string) {
  return serializeSubmission(async () => {
    const db = await connection()
    try {
      await db.run('BEGIN IMMEDIATE')
      const info = await scopeFor(db, sessionId)
      await initializeScope(db, info)
      const acknowledged: Row[] = [], conflicts: Row[] = [], rejected: string[] = []
      let added = 0, updated = 0, duplicates = 0
      const sessionResults: Row = JSON.parse(info.session.results_json)
      for (const raw of inputs) {
        if (!raw || raw.confirmed !== true || typeof raw.assetNo !== 'string' || !key(raw.assetNo)
          || typeof raw.dept !== 'string' || typeof raw.verifier !== 'string' || !raw.verifier.trim()
          || typeof raw.verifierDept !== 'string' || !raw.verifierDept.trim()
          || typeof raw.surveyedAt !== 'string' || !Number.isFinite(Date.parse(raw.surveyedAt))) {
          rejected.push(String(raw?.assetNo || '(없음)')); continue
        }
        const result = clean(raw)
        const assetKey = key(raw.assetNo)
        const previous = await db.get('SELECT * FROM inventory_submission_assets WHERE scope=? AND parent_dept=? AND asset_key=?', [info.scope, info.session.parent_dept, assetKey])
        const previousResult = previous ? JSON.parse(previous.result_json) : undefined
        if (previous && equivalent(previousResult, result)) {
          duplicates++
        } else if ((previous?.revision || 0) !== (Number(raw.serverRevision) || 0)) {
          conflicts.push({ assetNo: raw.assetNo, revision: previous?.revision || 0, result: previousResult }); continue
        } else {
          const revision = (previous?.revision || 0) + 1
          await db.run(`INSERT INTO inventory_submission_assets VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(scope,parent_dept,asset_key) DO UPDATE SET result_json=excluded.result_json,revision=excluded.revision,session_id=excluded.session_id`,
          [info.scope, info.session.parent_dept, assetKey, JSON.stringify(result), revision, sessionId])
          await db.run('INSERT INTO inventory_submission_audit(scope,asset_key,actor,previous_json,result_json,changed_at) VALUES (?,?,?,?,?,?)',
            [info.scope, assetKey, actor, previous?.result_json || null, JSON.stringify(result), new Date().toISOString()])
          previous ? updated++ : added++
        }
        const revision = previous && equivalent(previousResult, result) ? previous.revision : (previous?.revision || 0) + 1
        const saved = { ...(previous && equivalent(previousResult, result) ? previousResult : result), serverRevision: revision, syncState: 'saved' }
        // Remove aliases within this session instead of creating another asset row.
        for (const old of Object.keys(sessionResults)) if (key(old) === assetKey) delete sessionResults[old]
        sessionResults[raw.assetNo] = saved
        acknowledged.push({ assetNo: raw.assetNo, revision, result: saved })
        // Keep previously created sessions consistent when another inspector updates an asset.
        const siblings = await db.all('SELECT id,results_json FROM inventory_sessions WHERE dataset_id=? AND id<>?', [info.session.dataset_id, sessionId])
        for (const sibling of siblings) {
          const results = JSON.parse(sibling.results_json)
          const aliases = Object.keys(results).filter(no => key(no) === assetKey)
          if (!aliases.length) continue
          for (const no of aliases) delete results[no]
          results[raw.assetNo] = saved
          await db.run('UPDATE inventory_sessions SET results_json=?,updated_at=? WHERE id=?', [JSON.stringify(results), new Date().toISOString(), sibling.id])
        }
      }
      await db.run('UPDATE inventory_sessions SET results_json=?,uploaded_at=?,updated_at=? WHERE id=?', [JSON.stringify(sessionResults), new Date().toISOString(), new Date().toISOString(), sessionId])
      if (added + updated) await db.run(`UPDATE inventory_submission_books SET state='pending' WHERE scope=?`, [info.scope])
      await db.run('COMMIT')
      const book = await db.get('SELECT * FROM inventory_submission_books WHERE scope=?', [info.scope])
      const workbook = await generate(db, info)
      if (acknowledged.length || book.state !== 'ready') notifySubmission(sessionId)
      return { ok: !conflicts.length && !rejected.length && workbook.status === 'ready', submitted: acknowledged.length, added, updated, duplicates, failed: rejected.length,
        conflicts, rejected, acknowledged, workbook, error: conflicts.length ? '다른 사용자의 결과와 충돌했습니다. 내용을 비교해 주세요.' : rejected.length ? '필수 조사 정보가 없는 항목이 있습니다.' : undefined }
    } catch (error) { await db.run('ROLLBACK').catch(() => {}); throw error }
    finally { db.close() }
  })
}

export async function submissionStatus(sessionId: string) {
  const db = await connection()
  try {
    const info = await scopeFor(db, sessionId)
    const book = await db.get('SELECT * FROM inventory_submission_books WHERE scope=?', [info.scope])
    const count = await db.get('SELECT COUNT(*) AS total FROM inventory_submission_assets WHERE scope=?', [info.scope])
    return { masterId: info.master.id, year: info.year, status: book?.state || 'pending', generatedAt: book?.generated_at, error: book?.error, unmatched: 0, applied: Number(count.total) }
  } finally { db.close() }
}

export async function workingMaster(sessionId: string) {
  const db = await connection()
  try {
    const { master, session } = await scopeFor(db, sessionId)
    const buffer = await fs.readFile(path.join(process.cwd(), 'uploads/inventory-survey', master.stored_name))
    return { buffer, session, masterId: master.id }
  } finally { db.close() }
}

/** Read the published current-master workbook without creating a survey or submitting data. */
export async function currentSubmission(year: string) {
  if (!/^20\d{2}$/.test(year)) throw new Error('조사연도를 네 자리로 입력해 주세요.')
  const db = await connection()
  try {
    const master = await db.get('SELECT * FROM inventory_survey_forms ORDER BY rowid DESC LIMIT 1')
    if (!master || master.retired_at || master.purged_at) throw new Error('현재 등록된 ERP 원본이 없습니다.')
    const book = await db.get('SELECT * FROM inventory_submission_books WHERE scope=?', [`${master.id}:${year}`])
    if (!book) throw new Error('이 연도의 서버 반영 파일이 아직 없습니다. 확인 결과를 먼저 서버에 반영해 주세요.')
    if (book.state !== 'ready') throw new Error('최신 결과를 엑셀에 반영 중이거나 갱신에 실패했습니다. 잠시 후 다시 확인해 주세요.')
    const file = await db.get('SELECT * FROM inventory_files WHERE id=?', [book.file_id])
    if (!file) throw new Error('서버 반영 파일을 찾을 수 없습니다.')
    return { status: 'ready', masterId: master.id, fileId: file.id, fileName: file.file_name,
      generatedAt: book.generated_at, applied: Number(file.summary?.match(/확인 (\d+)건/)?.[1] || 0), unmatched: book.unmatched || 0 }
  } finally { db.close() }
}

/** Durable recovery: database commits survive a crash while writing Excel. */
export function startSubmissionRecovery() {
  let running = false
  const recover = async () => {
    if (running) return
    running = true
    const db = await connection()
    try {
      const pending = await db.all(`SELECT * FROM inventory_submission_books WHERE state IN ('pending','error')`)
      for (const book of pending) {
        const sessions = await db.all(`SELECT s.* FROM inventory_sessions s JOIN inventory_datasets d ON d.id=s.dataset_id WHERE d.source LIKE ?`, [`survey-form:${book.master_id}|%`])
        const session = sessions.find(row => yearOf(row) === book.year)
        if (session) await submitConfirmed(session.id, [], 'excel-recovery')
      }
    } finally { db.close(); running = false }
  }
  const timer = setInterval(() => { void recover().catch(() => {}) }, 30_000)
  timer.unref()
  void recover().catch(() => {})
}
