import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import express from '../server/node_modules/express'
import jwt from '../server/node_modules/jsonwebtoken'

test('public utilities retain revisions and only administrators can publish', async () => {
  process.env.DATABASE_PATH = ':memory:'
  process.env.ADMIN_ACCESS_CODE = 'utility-test-admin-only'
  process.env.INVENTORY_ACCESS_CODE = 'utility-test-field-only'
  process.env.JWT_SECRET = 'utility-test-jwt-secret'
  const { initUtilityStore, validateUtility } = await import('../server/src/lib/utilityStore')
  const { db, run } = await import('../server/src/config/database')
  const { default: routes } = await import('../server/src/routes/utility.routes')
  await run('CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, role TEXT, status TEXT)')
  await run("INSERT INTO users VALUES ('utility-admin','admin@example.invalid','admin','approved')")
  await initUtilityStore()
  await initUtilityStore()
  const app = express()
  app.use(express.json())
  app.use('/api/utilities', routes)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address() as { port: number }
  const base = `http://127.0.0.1:${address.port}/api/utilities`
  const adminToken = jwt.sign({ id: 'utility-admin' }, process.env.JWT_SECRET)
  const draft = { slug: 'image-tool', title: '이미지 도구', summary: '이미지 작업', category: '이미지', version: '1.0.0', features: '특징 첫 버전', usage: '파일을 선택하세요', changes: '첫 발행', launchUrl: '/marketplace' }
  const post = (body: unknown, token?: string) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
  try {
    assert.deepEqual(await (await fetch(base)).json(), [])
    assert.equal((await post(draft)).status, 401)
    assert.equal((await post(draft, process.env.INVENTORY_ACCESS_CODE)).status, 401)
    assert.equal((await post(draft, adminToken)).status, 201)
    assert.equal((await post({ ...draft, version: '1.1.0', features: '새 특징', changes: '사용법 갱신' }, adminToken)).status, 201)
    assert.equal((await post(draft, adminToken)).status, 400)
    const history = await (await fetch(`${base}/image-tool`)).json()
    assert.equal(history.length, 2)
    assert.equal(history[0].version, '1.1.0')
    assert.equal(history[1].features, '특징 첫 버전')
    const list = await (await fetch(base)).json()
    assert.equal(list.length, 1)
    assert.equal(list[0].version, '1.1.0')
    const ebsViewer = { ...draft, slug: 'ebs-viewer', title: 'EBS Viewer', version: '1.0.2', changes: '구버전' }
    assert.equal((await post(ebsViewer, adminToken)).status, 201)
    assert.equal((await post({ ...ebsViewer, version: '1.0.3', changes: '최신 버전' }, adminToken)).status, 201)
    const ebsHistory = await (await fetch(`${base}/ebs-viewer`)).json()
    assert.equal(ebsHistory.length, 1)
    assert.equal(ebsHistory[0].version, '1.0.3')
    assert.equal(ebsHistory[0].changes, '최신 버전')
    assert.equal((await fetch(`${base}/unknown`)).status, 404)
    assert.throws(() => validateUtility({ ...draft, launchUrl: 'javascript:alert(1)' }))
    assert.throws(() => validateUtility({ ...draft, launchUrl: '//example.test' }))
    assert.throws(() => validateUtility({ ...draft, slug: '../invalid' }))
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await new Promise<void>((resolve) => db.close(() => resolve()))
  }
})
