import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const dotenv = require('../server/node_modules/dotenv')
const root = path.resolve(import.meta.dirname, '..')
const report = { checkedAt: new Date().toISOString(), audits: [], responses: [], configuration: {} }
for (const dir of ['.', 'server']) {
  let raw
  try {
    raw = execFileSync(process.execPath, [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), 'audit', '--omit=dev', '--json'], { cwd: path.join(root, dir), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) { raw = e.stdout }
  try {
    const a = JSON.parse(raw)
    report.audits.push({ directory: dir, metadata: a.metadata, error: a.error, vulnerabilities: Object.values(a.vulnerabilities || {}).map((v) => ({ name: v.name, severity: v.severity, isDirect: v.isDirect, range: v.range, fixAvailable: v.fixAvailable, via: v.via })) })
  } catch { report.audits.push({ directory: dir, error: 'Audit unavailable' }) }
}
const env = dotenv.parse(fs.readFileSync(path.join(root, 'server/.env')))
report.configuration = { envProduction: env.NODE_ENV === 'production', adminCodeConfigured: Boolean(env.ADMIN_ACCESS_CODE), fieldCodeConfigured: Boolean(env.INVENTORY_ACCESS_CODE), distinctFieldAndAdmin: Boolean(env.INVENTORY_ACCESS_CODE && env.INVENTORY_ACCESS_CODE !== env.ADMIN_ACCESS_CODE) }
const publicHtml = await (await fetch('https://ebs-aihub.com/user/')).text()
const mainAsset = /<script[^>]+src="([^"]+)"/.exec(publicHtml)?.[1]
if (mainAsset && env.INVENTORY_ACCESS_CODE) {
  const assetUrl = new URL(mainAsset, 'https://ebs-aihub.com')
  if (assetUrl.origin !== 'https://ebs-aihub.com') throw new Error('Unexpected asset origin')
  const code = await (await fetch(assetUrl)).text()
  report.configuration.publicBundleContainsFieldToken = code.includes(env.INVENTORY_ACCESS_CODE)
  const assets = path.join(root, '.runtime/portals/user/assets')
  for (const file of fs.readdirSync(assets).filter((name) => name.endsWith('.js'))) {
    if (!fs.readFileSync(path.join(assets, file), 'utf8').includes(env.INVENTORY_ACCESS_CODE)) continue
    const publicCode = await (await fetch(`https://ebs-aihub.com/user/assets/${file}`)).text()
    if (publicCode.includes(env.INVENTORY_ACCESS_CODE)) report.configuration.publicBundleContainsFieldToken = true
  }
  const response = await fetch('https://ebs-aihub.com/api/inventory/sessions', { headers: { Authorization: `Bearer ${env.INVENTORY_ACCESS_CODE}` }, signal: AbortSignal.timeout(15000) })
  report.configuration.sharedFieldTokenSessionListStatus = response.status
  await response.arrayBuffer() // Do not print inventory records or credentials.
}
for (const route of ['/util', '/admin/', '/api/utilities', '/api/users', '/api/apps/imports', '/api/environment', '/.env', '/server/.env', '/.git/config', '/phpinfo.php', '/wp-login.php', '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php']) {
  try {
    const r = await fetch('https://ebs-aihub.com' + route, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
    await r.arrayBuffer()
    report.responses.push({ route, status: r.status, headers: Object.fromEntries(['content-type', 'server', 'x-powered-by', 'strict-transport-security', 'content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'ratelimit-limit'].map((key) => [key, r.headers.get(key)])) })
  } catch { report.responses.push({ route, error: 'Request failed' }) }
}
console.log(JSON.stringify(report, null, 2))
