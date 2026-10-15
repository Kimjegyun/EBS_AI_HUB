// End-to-end: several 본부·부서·조사자 submit results; the 전사 workbook must hold all of them in one file.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import sqlite3 from '../server/node_modules/sqlite3/lib/sqlite3.js'
import ExcelJS from 'exceljs'
import { submitConfirmed, buildCompanyWorkbook } from '../server/src/services/inventorySubmission'

const original = process.cwd()
await fs.mkdir(path.join(original, '.runtime'), { recursive: true })
const dir = await fs.mkdtemp(path.join(original, '.runtime/company-workbook-test-'))
process.chdir(dir)
process.env.DATABASE_PATH = path.join(dir, 'test.db')
await fs.mkdir('uploads/inventory-survey', { recursive: true })
const db = new sqlite3.Database(process.env.DATABASE_PATH)
const run = (sql: string, values: unknown[] = []) => new Promise<void>((resolve, reject) => db.run(sql, values, error => error ? reject(error) : resolve()))
await run('CREATE TABLE inventory_sessions(id TEXT PRIMARY KEY,name TEXT,dataset_id TEXT,parent_dept TEXT,dept TEXT,created_by TEXT,created_at TEXT,results_json TEXT,uploaded_at TEXT,updated_at TEXT)')
await run('CREATE TABLE inventory_datasets(id TEXT PRIMARY KEY,source TEXT)')
await run('CREATE TABLE inventory_survey_forms(id TEXT PRIMARY KEY,stored_name TEXT,retired_at TEXT,purged_at TEXT)')

// Master: two 본부 sheets with the 운영관리부 layout ('현재' above 설치부서).
const master = new ExcelJS.Workbook()
for (const [hq, assets] of [['경영본부', ['KA-1', 'KA-2', 'KA-3']], ['기술본부', ['GB-1', 'GB-2']]] as const) {
  const sheet = master.addWorksheet(hq)
  sheet.getCell('B1').value = '현재'
  sheet.addRow(['자산번호', '설치부서', '설치장소', '부서이동', '위치이동', '비고'])
  for (const no of assets) sheet.addRow([no, `${hq} 원래부서`, '원래자리'])
}
await master.xlsx.writeFile('uploads/inventory-survey/master.xlsx')
await run('INSERT INTO inventory_survey_forms VALUES (?,?,?,?)', ['m1', 'master.xlsx', null, null])
await run('INSERT INTO inventory_datasets VALUES (?,?)', ['d-k', 'survey-form:m1|sheet:경영본부'])
await run('INSERT INTO inventory_datasets VALUES (?,?)', ['d-g', 'survey-form:m1|sheet:기술본부'])

// One shared session per 부서 (several users can share one).
const sessions = [
  ['s-k1', 'd-k', '경영본부', '총무부'],
  ['s-k2', 'd-k', '경영본부', '인사부'],
  ['s-g1', 'd-g', '기술본부', '송출부'],
]
for (const [id, dataset, hq, dept] of sessions) {
  await run('INSERT INTO inventory_sessions VALUES (?,?,?,?,?,?,?,?,?,?)', [id, '2026년 재물조사', dataset, hq, dept, 'creator', '2026-01-01', '{}', null, null])
}
const result = (assetNo: string, verifier: string, verifierDept: string, surveyedAt: string, extra = {}) =>
  ({ assetNo, confirmed: true, dept: '', verifier, verifierDept, surveyedAt, ...extra })

// 총무부: two users. 인사부: one user. 기술본부 송출부: own asset + a 경영본부 asset found in its area.
const outcomes = await Promise.all([
  submitConfirmed('s-k1', [result('KA-1', '김철수', '경영본부 총무부', '2026-09-01T01:00:00Z', { dept: '경영본부 원래부서' })], 'kim'),
  submitConfirmed('s-k1', [result('KA-2', '이영희', '경영본부 총무부', '2026-09-01T02:00:00Z', { dept: '경영본부 원래부서', location: '새자리' })], 'lee'),
  submitConfirmed('s-k2', [result('KA-3', '박민수', '경영본부 인사부', '2026-09-02T01:00:00Z', { dept: '경영본부 원래부서' })], 'park'),
  submitConfirmed('s-g1', [
    result('GB-1', '최지훈', '기술본부 송출부', '2026-09-03T01:00:00Z', { dept: '기술본부 원래부서' }),
    result('KA-3', '최지훈', '기술본부 송출부', '2026-09-01T01:00:00Z', { dept: '기술본부 송출부' }),
  ], 'choi'),
])
for (const outcome of outcomes) assert.equal(outcome.ok, true, JSON.stringify(outcome))

const built = await buildCompanyWorkbook('2026')
const book = new ExcelJS.Workbook()
await book.xlsx.load(built.buffer)
const rowOf = (sheet: ExcelJS.Worksheet, assetNo: string) => {
  let found: ExcelJS.Row | undefined
  sheet.eachRow(row => { if (row.getCell(1).text === assetNo) found = row })
  assert.ok(found, `${sheet.name} ${assetNo} row`)
  return found!
}
const header = (sheet: ExcelJS.Worksheet) => {
  const cols: Record<string, number> = {}
  sheet.getRow(2).eachCell(cell => { cols[cell.text] = Number(cell.col) })
  return cols
}
const k = book.getWorksheet('경영본부')!, g = book.getWorksheet('기술본부')!
const kc = header(k), gc = header(g)

assert.equal(built.headquarters, 2)
assert.equal(rowOf(k, 'KA-1').getCell(kc['조사자']).text, '김철수')
assert.equal(rowOf(k, 'KA-1').getCell(kc['조사부서']).text, '총무부')
assert.equal(rowOf(k, 'KA-2').getCell(kc['조사자']).text, '이영희')
assert.equal(rowOf(k, 'KA-2').getCell(kc['위치이동']).text, '새자리')
assert.equal(rowOf(k, 'KA-3').getCell(kc['조사자']).text, '박민수', 'newer own-본부 result wins over an older cross-본부 find')
assert.equal(rowOf(k, 'KA-3').getCell(kc['조사부서']).text, '인사부')
assert.equal(rowOf(g, 'GB-1').getCell(gc['조사자']).text, '최지훈')
assert.equal(rowOf(g, 'GB-2').getCell(gc['확인완료']).text, '', 'unsurveyed asset stays blank')
assert.equal(book.getWorksheet('제출 미매칭 확인'), undefined, 'a cross-본부 find of a listed asset is not unmatched')
assert.equal(built.unmatched, 0)

// A later cross-본부 find (asset moved to 기술본부) is written on the asset's own 본부 row.
await submitConfirmed('s-g1', [result('KA-1', '최지훈', '기술본부 송출부', '2026-09-10T01:00:00Z', { dept: '기술본부 송출부' })], 'choi')
const later = new ExcelJS.Workbook()
await later.xlsx.load((await buildCompanyWorkbook('2026')).buffer)
const lk = later.getWorksheet('경영본부')!
assert.equal(rowOf(lk, 'KA-1').getCell(kc['조사자']).text, '최지훈')
assert.equal(rowOf(lk, 'KA-1').getCell(kc['조사부서']).text, '기술본부 송출부')
assert.equal(rowOf(lk, 'KA-1').getCell(kc['부서이동']).text, '기술본부 송출부')

// Assets missing from every 본부 sheet still go to the unmatched sheet.
await submitConfirmed('s-g1', [result('ZZ-9', '최지훈', '기술본부 송출부', '2026-09-11T01:00:00Z', { dept: '기술본부 송출부' })], 'choi')
const withExtra = await buildCompanyWorkbook('2026')
assert.equal(withExtra.unmatched, 1)

await new Promise<void>((resolve, reject) => db.close(error => error ? reject(error) : resolve()))
process.chdir(original)
await fs.rm(dir, { recursive: true, force: true })
console.log('PASS company workbook: 2 본부, 3 부서, 4 조사자, concurrent submits, cross-본부 finds, unmatched')
process.exit(0)
