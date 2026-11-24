import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import express from '../server/node_modules/express'
import jwt from '../server/node_modules/jsonwebtoken'
import * as XLSX from '../server/node_modules/xlsx/xlsx'
import { normalizeResourcePolicy, validatePreparedAudio } from '../server/src/lib/resourcePolicy'
import { encodePcmWav } from '../src/lib/browserAudio'
import { heavyMobileWork, workbookExpandedSize } from '../src/lib/mobileResources'

test('policy validates modes, caps and user PCM format', () => {
  assert.deepEqual(normalizeResourcePolicy(null), { audioMode: 'user', workbookMode: 'user', maxConcurrent: 2, mobileHeavyToServer: true })
  assert.deepEqual(normalizeResourcePolicy({}), { audioMode: 'user', workbookMode: 'user', maxConcurrent: 2, mobileHeavyToServer: true })
  assert.equal(normalizeResourcePolicy({ audioMode: 'central' }).audioMode, 'central')
  assert.throws(() => normalizeResourcePolicy({ audioMode: 'automatic' }, true))
  for (const maxConcurrent of [0, 5, 1.5, '2']) assert.throws(() => normalizeResourcePolicy({ audioMode: 'user', workbookMode: 'central', maxConcurrent }, true))
  const wav = new Uint8Array(encodePcmWav(new Float32Array([-2, -0.5, 0, 0.5, 2])))
  assert.equal(validatePreparedAudio(wav), true)
  const view = new DataView(wav.buffer)
  assert.equal(view.getInt16(44, true), -32768)
  assert.equal(view.getInt16(52, true), 32767)
  wav[24] = 0
  assert.equal(validatePreparedAudio(wav), false)
  assert.equal(validatePreparedAudio(Buffer.alloc(5 * 1024 * 1024)), false)
})

test('mobile thresholds select heavy tasks before decoding or inflating', () => {
  assert.equal(heavyMobileWork('audio', 1024, 180, undefined, false), false)
  assert.equal(heavyMobileWork('audio', 1024, 181, undefined, false), true)
  assert.equal(heavyMobileWork('audio', 1024, null, undefined, false), true)
  assert.equal(heavyMobileWork('audio', 5 * 1024 * 1024 + 1, 1, undefined, false), true)
  assert.equal(heavyMobileWork('workbook', 2 * 1024 * 1024, undefined, 16 * 1024 * 1024, false), false)
  assert.equal(heavyMobileWork('workbook', 2 * 1024 * 1024 + 1, undefined, 0, false), true)
  assert.equal(heavyMobileWork('workbook', 1024, undefined, 16 * 1024 * 1024 + 1, false), true)
  assert.equal(heavyMobileWork('audio', 10, 1, undefined, true), true)
  assert.equal(normalizeResourcePolicy({ mobileHeavyToServer: false }).mobileHeavyToServer, false)
  assert.throws(() => normalizeResourcePolicy({ audioMode: 'user', workbookMode: 'user', maxConcurrent: 2, mobileHeavyToServer: 'true' }, true))
  assert.equal(workbookExpandedSize(new ArrayBuffer(4)), 4)
})

test('authenticated policy, workbook routing, audio routing and concurrent admission', async () => {
  process.env.DATABASE_PATH = ':memory:'
  process.env.ADMIN_ACCESS_CODE = 'resource-fixture-admin'
  process.env.JWT_SECRET = 'resource-fixture-jwt-secret'
  process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  const { db, run } = await import('../server/src/config/database')
  const { writeEnvironmentData, readEnvironmentData } = await import('../server/src/lib/environmentStore')
  const { resourceActivity } = await import('../server/src/lib/resourceExecution')
  const { default: routes } = await import('../server/src/routes/resource.routes')
  const { default: environmentRoutes } = await import('../server/src/routes/environment.routes')
  const { default: aiRoutes } = await import('../server/src/routes/ai.routes')
  const { errorHandler } = await import('../server/src/middleware/errorHandler')
  await run('CREATE TABLE environment_config (id TEXT PRIMARY KEY, data TEXT, updated_at TEXT)')
  await run('CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, role TEXT, status TEXT)')
  await run("INSERT INTO users VALUES ('resource-user','fixture@example.invalid','user','approved')")
  await run("INSERT INTO users VALUES ('resource-admin','admin@example.invalid','admin','approved')")
  await writeEnvironmentData({ admin_notes: 'preserve', ai_together_api_key: 'fixture-key' })
  const app = express()
  app.use(express.json())
  app.use('/api/resources', routes)
  app.use('/api/environment', environmentRoutes)
  app.use('/api/ai', aiRoutes)
  app.use(errorHandler)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const nativeFetch = globalThis.fetch
  let providerCalls = 0, unblock: (() => void) | undefined, entered: (() => void) | undefined
  const providerFiles: Array<{ name: string; size: number }> = []
  let hold = false
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    if (String(input).startsWith('https://api.together.ai/')) {
      providerCalls++
      const file = (init?.body as FormData).get('file') as File
      providerFiles.push({ name: file.name, size: file.size })
      entered?.()
      if (hold) await new Promise<void>(resolve => { unblock = resolve })
      return new Response(JSON.stringify({ text: 'verified speech' }), { status: 200 })
    }
    return nativeFetch(input, init)
  }) as typeof fetch
  const admin = { Authorization: `Bearer ${jwt.sign({ id: 'resource-admin' }, process.env.JWT_SECRET)}` }
  const user = { Authorization: `Bearer ${jwt.sign({ id: 'resource-user' }, process.env.JWT_SECRET)}` }
  const change = (policy: unknown, headers = admin) => fetch(`${origin}/api/resources`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ policy }) })
  const filePost = (path: string, bytes: ArrayBuffer | Buffer, name: string, type: string, signal?: AbortSignal, mobile = false) => {
    const body = new FormData(); body.append('file', new Blob([new Uint8Array(bytes)]), name)
    if (path.includes('transcribe')) body.append('language', 'ko')
    return fetch(origin + path, { method: 'POST', headers: { ...user, ...(mobile ? { 'X-AIHub-Execution': 'mobile-central' } : {}) }, body, signal })
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['자산번호', '자산명'], ['A-001', '보존한 이름']]), '자산')
  const excel = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const wav = encodePcmWav(new Float32Array(1600).fill(0.1))
  try {
    assert.equal((await fetch(`${origin}/api/resources`)).status, 401)
    assert.equal((await fetch(`${origin}/api/resources`, { headers: user })).status, 200)
    assert.deepEqual((await (await fetch(`${origin}/api/resources`, { headers: user })).json()).policy, { audioMode: 'user', workbookMode: 'user', maxConcurrent: 2, mobileHeavyToServer: true })
    assert.equal((await fetch(`${origin}/api/resources/status`, { headers: user })).status, 403)
    const local = { audioMode: 'user', workbookMode: 'user', maxConcurrent: 1 }
    assert.equal((await change(local, user)).status, 403)
    assert.equal((await change({ ...local, maxConcurrent: 9 })).status, 400)
    assert.equal((await change(local)).status, 200)
    assert.equal((await readEnvironmentData()).admin_notes, 'preserve')
    assert.equal((await readEnvironmentData()).ai_together_api_key, 'fixture-key')
    const publicBody = await (await fetch(`${origin}/api/resources`, { headers: user })).text()
    assert.equal(publicBody.includes('fixture-key'), false)
    assert.equal((await filePost('/api/resources/workbook', excel, 'fixture.xlsx', 'application/octet-stream')).status, 409)
    assert.equal((await filePost('/api/ai/transcribe', Buffer.from('not prepared'), 'original.mp3', 'audio/mpeg')).status, 409)
    assert.equal(providerCalls, 0)
    assert.equal((await filePost('/api/ai/transcribe', wav, 'part.wav', 'audio/wav')).status, 200)
    assert.equal(providerCalls, 1)
    assert.equal((await filePost('/api/ai/transcribe', Buffer.alloc(4 * 1024 * 1024 + 1), 'too-big.wav', 'audio/wav')).status, 413)
    assert.equal(resourceActivity().active, 0)
    assert.equal((await filePost('/api/resources/workbook', excel, 'mobile.xlsx', 'application/octet-stream', undefined, true)).status, 200)
    assert.equal((await filePost('/api/ai/transcribe', Buffer.from('original'), 'mobile.mp3', 'audio/mpeg', undefined, true)).status, 200)
    assert.equal((await change({ ...local, mobileHeavyToServer: false })).status, 200)
    assert.equal((await filePost('/api/resources/workbook', excel, 'mobile.xlsx', 'application/octet-stream', undefined, true)).status, 409)
    assert.equal((await filePost('/api/ai/transcribe', Buffer.from('original'), 'mobile.mp3', 'audio/mpeg', undefined, true)).status, 409)
    assert.equal((await change({ audioMode: 'central', workbookMode: 'central', maxConcurrent: 1 })).status, 200)
    const response = await filePost('/api/resources/workbook', excel, 'fixture.xlsx', 'application/octet-stream')
    assert.equal(response.status, 200)
    assert.equal((await response.json()).workbook.Sheets['자산'].B2.v, '보존한 이름')
    // Exercise real FFmpeg on the central >8MB path without calling a paid API.
    const largeWav = encodePcmWav(new Float32Array(16000 * 270))
    assert.equal((await filePost('/api/ai/transcribe', largeWav, 'large.wav', 'audio/wav')).status, 200)
    assert.match(providerFiles.at(-1)!.name, /^chunk-\d+\.mp3$/)
    assert.ok(providerFiles.at(-1)!.size < 8 * 1024 * 1024)
    // General settings containing an old snapshot cannot undo the resource policy.
    await fetch(`${origin}/api/environment`, { method: 'PUT', headers: { ...admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { resource_policy: local, admin_notes: 'updated' } }) })
    assert.equal(((await readEnvironmentData()).resource_policy as any).audioMode, 'central')
    hold = true
    const admission = new Promise<void>(resolve => { entered = resolve })
    const first = filePost('/api/ai/transcribe', wav, 'source.wav', 'audio/wav')
    await admission
    assert.equal(resourceActivity().active, 1)
    const second = await filePost('/api/ai/transcribe', wav, 'source.wav', 'audio/wav')
    assert.equal(second.status, 429)
    assert.equal(second.headers.get('Retry-After'), '5')
    assert.equal((await filePost('/api/resources/workbook', excel, 'fixture.xlsx', 'application/octet-stream')).status, 429)
    unblock?.(); hold = false
    assert.equal((await first).status, 200)
    assert.equal(resourceActivity().active, 0)
    assert.equal((await filePost('/api/ai/transcribe', wav, 'source.wav', 'audio/wav')).status, 200)
    // A disconnected browser must not make a still-running provider job free a slot early.
    hold = true
    const controller = new AbortController()
    const started = new Promise<void>(resolve => { entered = resolve })
    const abandoned = filePost('/api/ai/transcribe', wav, 'source.wav', 'audio/wav', controller.signal).catch(() => undefined)
    await started
    controller.abort(); await abandoned
    assert.equal(resourceActivity().active, 1)
    assert.equal((await filePost('/api/ai/transcribe', wav, 'source.wav', 'audio/wav')).status, 429)
    unblock?.(); hold = false
    for (let i = 0; resourceActivity().active && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(resourceActivity().active, 0)
  } finally {
    unblock?.(); globalThis.fetch = nativeFetch
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await new Promise<void>(resolve => db.close(() => resolve()))
  }
})
