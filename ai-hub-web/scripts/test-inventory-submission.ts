import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import sqlite3 from '../server/node_modules/sqlite3/lib/sqlite3.js'
import ExcelJS from 'exceljs'
import { submitConfirmed, submissionStatus, exportConfirmedResults } from '../server/src/services/inventorySubmission'
import { registerSseClient } from '../server/src/services/inventoryEvents'

const original = process.cwd()
const dir = await fs.mkdtemp(path.join(original, '.runtime/submission-test-'))
process.chdir(dir)
process.env.DATABASE_PATH = path.join(dir, 'test.db')
await fs.mkdir('uploads/inventory-survey', { recursive: true })
const db = new sqlite3.Database(process.env.DATABASE_PATH)
const run = (sql: string, values: unknown[] = []) => new Promise<void>((resolve, reject) => db.run(sql, values, error => error ? reject(error) : resolve()))
const all = (sql: string) => new Promise<any[]>((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)))
await run('CREATE TABLE inventory_sessions(id TEXT PRIMARY KEY,name TEXT,dataset_id TEXT,parent_dept TEXT,dept TEXT,created_by TEXT,created_at TEXT,results_json TEXT,uploaded_at TEXT,updated_at TEXT)')
await run('CREATE TABLE inventory_datasets(id TEXT PRIMARY KEY,source TEXT)')
await run('CREATE TABLE inventory_survey_forms(id TEXT PRIMARY KEY,stored_name TEXT)')
await run('CREATE TABLE inventory_files(id TEXT PRIMARY KEY,kind TEXT,parent_dept TEXT,file_name TEXT,stored_name TEXT,size INTEGER,summary TEXT,created_at TEXT)')
const workbook = new ExcelJS.Workbook()
const sheet = workbook.addWorksheet('본부')
sheet.mergeCells('B1:C1'); sheet.getCell('B1').value = '현재'
sheet.addRow(['자산번호', '설치부서', '설치장소', '부서이동', '위치이동'])
sheet.addRow(['A-1', '기존', '자리1']); sheet.addRow(['A-2', '미확인', '자리2'])
await workbook.xlsx.writeFile('uploads/inventory-survey/master.xlsx')
const originalMaster = await fs.readFile('uploads/inventory-survey/master.xlsx')
await run('INSERT INTO inventory_survey_forms VALUES (?,?)', ['m1', 'master.xlsx'])
await run('INSERT INTO inventory_datasets VALUES (?,?)', ['d1', 'survey-form:m1|sheet:본부'])
for (const id of ['s1', 's2']) await run('INSERT INTO inventory_sessions VALUES (?,?,?,?,?,?,?,?,?,?)', [id, '2026 조사', 'd1', '본부', '부서', 'user', '2026-01-01', '{}', null, null])
const input = { assetNo: 'A1', confirmed: true, dept: '새부서', location: '자리3', verifier: '사용자1', verifierDept: '부서', surveyedAt: '2026-09-22T01:00:00Z', status: '부서이동' }
const events: Array<{ event: string; data: any }> = []
const unsubscribe = registerSseClient('*', (event, data) => events.push({ event, data }))
const sessionEvents: string[] = []
const unsubscribeSession = registerSseClient('s1', event => sessionEvents.push(event))
const first = await submitConfirmed('s1', [input, { ...input, assetNo: 'A2', confirmed: false }], 'user1')
assert.equal(events.at(-1)?.event, 'submission_updated')
assert.deepEqual(events.at(-1)?.data, { sessionId: 's1' })
assert.equal(sessionEvents.at(-1), 'result_updated')
assert.equal((await submissionStatus('s1')).status, 'ready')
unsubscribe(); unsubscribeSession()
assert.equal(first.added, 1); assert.equal(first.failed, 1); assert.equal(first.workbook.status, 'ready')
const retry = await submitConfirmed('s1', [input], 'user1')
assert.equal(retry.added, 0); assert.equal(retry.duplicates, 1)
const conflict = await submitConfirmed('s2', [{ ...input, verifier: '사용자2', dept: '충돌부서' }], 'user2')
assert.equal(conflict.conflicts.length, 1)
const revision = conflict.conflicts[0].revision
const updated = await submitConfirmed('s2', [{ ...input, verifier: '사용자2', dept: '확정부서', serverRevision: revision }], 'user2')
assert.equal(updated.updated, 1)
const simultaneous = await Promise.all([
  submitConfirmed('s1', [{ ...input, dept: '동시1', serverRevision: 2 }], 'u1'),
  submitConfirmed('s2', [{ ...input, dept: '동시2', serverRevision: 2 }], 'u2'),
])
assert.equal(simultaneous.reduce((n, r) => n + r.updated, 0), 1)
assert.equal(simultaneous.reduce((n, r) => n + r.conflicts.length, 0), 1)

const rows = await exportConfirmedResults('2026')
assert.equal(rows.length, 1)
assert.equal(rows[0].confirmed, true)
assert.equal((await exportConfirmedResults('2025')).length, 0)
assert.equal((await all('SELECT * FROM inventory_files')).length, 0)
assert.deepEqual(await fs.readFile('uploads/inventory-survey/master.xlsx'), originalMaster)
assert.equal((await submissionStatus('s1')).applied, 1)
await new Promise<void>((resolve, reject) => db.close(error => error ? reject(error) : resolve()))
process.chdir(original)
console.log('PASS database submissions, duplicates, concurrent conflicts, export year scope, original unchanged, no master workbook generated')
await new Promise(resolve => setTimeout(resolve, 100))
process.exit(0)
