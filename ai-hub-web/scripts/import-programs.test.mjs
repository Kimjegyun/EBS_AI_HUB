import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { packageProgram, runPipeline, containedFile, validateManifest } from './import-programs.mjs'

test('example produces a compatible package without executing its factory', async () => {
  const { pkg, text } = await packageProgram(path.resolve('import_program/_example'))
  assert.equal(pkg.format, 'ebs-ai-hub-app')
  assert.equal(pkg.app.id, 'import-example')
  assert.equal(pkg.sha256, createHash('sha256').update(pkg.code).digest('hex'))
  assert.ok(Buffer.byteLength(text) < 2 * 1024 * 1024)
  assert.match(pkg.code, /default/)
})

test('validation rejects invalid permissions and ids', () => {
  assert.throws(() => validateManifest({}))
  assert.throws(() => validateManifest({ id: '../escape' }))
  assert.throws(() => validateManifest({ id: 'example', name: 'Example', version: '1', category: 'AI', entry: 'app.js', permissions: ['admin'] }))
})

test('pipeline isolates failed folders and preserves submission state', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'aihub-import-'))
  const previousFetch = globalThis.fetch
  try {
    const input = path.join(temp, 'input')
    const good = path.join(input, 'good')
    await mkdir(good, { recursive: true })
    await mkdir(path.join(input, 'broken'))
    await writeFile(path.join(good, 'aihub-app.json'), JSON.stringify({ id: 'test-app', name: 'Test', version: '1.0.0', category: 'AI', entry: 'entry.js', permissions: [] }))
    await writeFile(path.join(good, 'entry.js'), 'export default () => ({ Body() { return null } })')
    const output = path.join(temp, 'output')
    let calls = 0
    globalThis.fetch = async (url, init) => {
      calls++
      assert.equal(url, 'https://example.test/api/apps/remote/submit')
      assert.equal(init.headers.Authorization, 'Bearer test-token')
      assert.equal(JSON.parse(await init.body.get('bundle').text()).app.id, 'test-app')
      return Response.json({ version: { versionId: 7 } }, { status: 201 })
    }
    const options = { input, output, submit: true, apiUrl: 'https://example.test', token: 'test-token' }
    const first = await runPipeline(options)
    assert.equal(first.find((r) => r.folder === 'good').status, 'pending-review')
    assert.equal(first.find((r) => r.folder === 'broken').status, 'failed')
    const second = await runPipeline(options)
    assert.equal(second.find((r) => r.folder === 'good').status, 'already-submitted')
    assert.equal(calls, 1)
    assert.ok(!(await readFile(path.join(output, 'state.json'), 'utf8')).includes('test-token'))
    await assert.rejects(containedFile(good, '../good/../../output/state.json'), /폴더 밖/)
    await assert.rejects(runPipeline({ ...options, apiUrl: 'http://example.test' }), /HTTPS/)
    await writeFile(path.join(good, 'entry.js'), 'import "./style.css"; export default () => ({})')
    await writeFile(path.join(good, 'style.css'), 'body { color: red }')
    await assert.rejects(packageProgram(good), /단일 JS/)
  } finally {
    globalThis.fetch = previousFetch
    await rm(temp, { recursive: true, force: true })
  }
})
