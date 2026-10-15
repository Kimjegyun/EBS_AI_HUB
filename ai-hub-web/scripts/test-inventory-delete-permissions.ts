import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import express from '../server/node_modules/express/index.js'
const dir = await fs.mkdtemp(path.join(process.cwd(), '.runtime/delete-permissions-'))
process.env.DATABASE_PATH = path.join(dir, 'test.db')
process.env.ADMIN_ACCESS_CODE = 'test-only-admin-delete'
process.env.INVENTORY_ACCESS_CODE = 'test-only-user-delete'
const { initDatabase, run, get, db } = await import('../server/src/config/database')
await initDatabase()
const { default: router } = await import('../server/src/routes/inventory.routes')
await run("INSERT INTO inventory_datasets(id,title,parent_dept,assets_json) VALUES ('test-db','Test','HQ','[]')")
await run("INSERT INTO inventory_sessions(id,name,dataset_id,parent_dept,dept,created_by,results_json) VALUES ('test-session','Test','test-db','HQ','Dept','test','{}')")
const app = express(); app.use(express.json()); app.use('/api/inventory', router)
const server = app.listen(0, '127.0.0.1')
await new Promise<void>(resolve => server.once('listening', resolve))
const port = (server.address() as { port: number }).port
const remove = (route: string, token: string, body = {}) => fetch(`http://127.0.0.1:${port}/api/inventory${route}`, {
  method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
for (const route of ['/sessions/test-session', '/sessions/test-session/results/A', '/master-files/missing', '/datasets/test-db', '/datasets/survey-form/missing']) {
  assert.equal((await remove(route, process.env.INVENTORY_ACCESS_CODE, { confirmed: true })).status, 403)
}
assert.equal((await remove('/sessions/test-session', process.env.ADMIN_ACCESS_CODE)).status, 400)
assert.ok(await get("SELECT id FROM inventory_sessions WHERE id='test-session'"))
assert.equal((await remove('/sessions/test-session', process.env.ADMIN_ACCESS_CODE, { confirmed: true })).status, 200)
assert.equal(await get("SELECT id FROM inventory_sessions WHERE id='test-session'"), undefined)
server.closeAllConnections()
await new Promise<void>(resolve => server.close(() => resolve()))
await new Promise<void>((resolve, reject) => db.close(error => error ? reject(error) : resolve()))
await new Promise(resolve => setTimeout(resolve, 50))
console.log('PASS USER deletion blocked; ADMIN requires confirmation; confirmed deletion works in isolated DB')
process.exit(0)
