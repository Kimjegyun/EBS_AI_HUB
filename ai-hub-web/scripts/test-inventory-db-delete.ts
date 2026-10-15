import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

const dir = await fs.mkdtemp(path.join(process.cwd(), '.runtime/db-delete-test-'))
process.env.DATABASE_PATH = path.join(dir, 'test.db')
const { run, get, db } = await import('../server/src/config/database')
const { deleteDatasetHandler, getDatasets } = await import('../server/src/controllers/inventory.controller')
await run('CREATE TABLE inventory_datasets(id TEXT PRIMARY KEY,title TEXT,parent_dept TEXT,asset_count INTEGER,uploaded_by TEXT,uploaded_at TEXT,source TEXT)')
await run('CREATE TABLE inventory_sessions(id TEXT PRIMARY KEY,dataset_id TEXT)')
for (const id of ['unused', 'used']) await run('INSERT INTO inventory_datasets VALUES (?,?,?,?,?,?,?)', [id, id, 'HQ', 10, 'admin', '2026-09-22', 'survey-form:master|sheet:HQ'])
await run('INSERT INTO inventory_sessions VALUES (?,?)', ['session', 'used'])
function response() {
  return { code: 200, body: null as any, status(code: number) { this.code = code; return this }, json(body: unknown) { this.body = body; return this } }
}
const list = response()
await getDatasets({} as any, list as any)
assert.equal(list.body.find((d: any) => d.id === 'unused').sessionCount, 0)
assert.equal(list.body.find((d: any) => d.id === 'used').sessionCount, 1)
const removed = response()
await deleteDatasetHandler({ params: { id: 'unused' }, query: {} } as any, removed as any)
assert.equal(removed.code, 200)
assert.equal(await get('SELECT * FROM inventory_datasets WHERE id=?', ['unused']), undefined)
const blocked = response()
await deleteDatasetHandler({ params: { id: 'used' }, query: { force: 'true' } } as any, blocked as any)
assert.equal(blocked.code, 409)
assert.ok(await get('SELECT * FROM inventory_datasets WHERE id=?', ['used']))
assert.ok(await get('SELECT * FROM inventory_sessions WHERE id=?', ['session']))
const missing = response()
await deleteDatasetHandler({ params: { id: 'missing' }, query: {} } as any, missing as any)
assert.equal(missing.code, 404)
db.close()
console.log('PASS database counts, unused DB deletion, linked survey protection including force=true, missing DB response')
process.exit(0)
