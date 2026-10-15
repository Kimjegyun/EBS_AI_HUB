// Verify the actual QR destination, including the downloaded JavaScript bytes.
// Run after: node scripts/build-inventory-public.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, '.runtime/inventory-public')
const origin = (await fs.readFile(path.join(root, '.runtime/current-tunnel-url.txt'), 'utf8')).replace(/^\uFEFF/, '').trim()
const localVersion = JSON.parse(await fs.readFile(path.join(output, 'inventory-version.json'), 'utf8'))
async function download(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
  assert.equal(response.status, 200, `HTTP error: ${url}`)
  return response
}
const remoteVersion = await (await download(`${origin}/inventory-version.json?check=${Date.now()}`)).json()
assert.equal(remoteVersion.buildId, localVersion.buildId, 'Server version differs from the latest local build')
const scriptPath = (html) => html.match(/<script[^>]+src="([^"]+)"/)?.[1]
const localScript = scriptPath(await fs.readFile(path.join(output, 'inventory.html'), 'utf8'))
assert.ok(localScript?.startsWith('/assets/'), 'Missing local application script')
const remoteScript = scriptPath(await (await download(`${origin}/inventory.html?check=${Date.now()}`)).text())
assert.equal(remoteScript, localScript, 'QR HTML points to a different application build')
const localBytes = await fs.readFile(path.join(output, localScript))
const remoteBytes = Buffer.from(await (await download(new URL(remoteScript, origin))).arrayBuffer())
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
assert.equal(hash(remoteBytes), hash(localBytes), 'QR application bytes differ from the latest build')
console.log(`PASS QR server version, HTML and application: ${localVersion.buildId}`)
console.log(`Mobile URL: ${origin}/inventory.html`)
