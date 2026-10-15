import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { build, loadConfigFromFile } from 'vite'
import { parse } from '../server/node_modules/dotenv/lib/main.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)
const server = parse(fs.readFileSync(path.join(root, 'server/.env')))
const token = server.INVENTORY_ACCESS_CODE?.trim()
if (!token || token === server.ADMIN_ACCESS_CODE?.trim()) {
  throw new Error('A separate INVENTORY_ACCESS_CODE is required for the QR user build.')
}
const readUrl = (file) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim() : ''
// The public portal gateway (e.g. https://ebs-aihub.com) serves /inventory.html and the
// API, so QR codes and install links use it; the 3001 server's own tunnel is a fallback.
const tunnelOrigin = readUrl(path.join(root, '.runtime/current-tunnel-url.txt'))
const apiOrigin = readUrl(path.join(root, '.runtime/public-portals-url.txt')) || tunnelOrigin
if (!/^https:\/\/[a-z0-9.-]+$/i.test(apiOrigin)) throw new Error('A valid public HTTPS tunnel URL is required.')
const origin = apiOrigin
process.env.VITE_INVENTORY_TOKEN = token
process.env.VITE_INVENTORY_API_URL = apiOrigin
process.env.VITE_INVENTORY_PREVIOUS_API_ORIGIN = tunnelOrigin || apiOrigin
process.env.VITE_INVENTORY_PUBLIC_APP_URL = `${origin}/inventory.html`
process.env.VITE_LOCAL_STORAGE_SECRET = ''
const builtAt = new Date().toISOString()
const buildId = `${builtAt.replace(/[-:.]/g, '')}-${randomUUID().slice(0, 8)}`
process.env.VITE_INVENTORY_BUILD_ID = buildId
process.env.VITE_INVENTORY_BUILT_AT = builtAt
const loaded = await loadConfigFromFile({ command: 'build', mode: 'user' }, path.join(root, 'vite.config.ts'))
if (!loaded) throw new Error('Vite configuration not found.')
await build({
  ...loaded.config, configFile: false, mode: 'user',
  build: {
    ...loaded.config.build,
    outDir: '.runtime/inventory-public',
    rollupOptions: { input: { inventory: path.join(root, 'inventory.html') } },
  },
})
fs.writeFileSync(path.join(root, '.runtime/inventory-public/inventory-version.json'), JSON.stringify({ buildId, builtAt }, null, 2))
// Both local portals must advertise the build just published through the tunnel,
// rather than falling back to an older, unrelated Vercel deployment.
// Write only after a successful build; Vite reloads the changed mode env files.
for (const mode of ['admin', 'user']) {
  const envPath = path.join(root, `.env.${mode}.local`)
  const previous = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  const entry = `VITE_INVENTORY_PUBLIC_APP_URL=${origin}/inventory.html`
  const next = /^VITE_INVENTORY_PUBLIC_APP_URL=.*$/m.test(previous)
    ? previous.replace(/^VITE_INVENTORY_PUBLIC_APP_URL=.*$/m, entry)
    : `${previous.trimEnd()}\n${entry}\n`
  if (next !== previous) fs.writeFileSync(envPath, next)
}
console.log(`QR user build ready: ${origin}/inventory.html`)
console.log(`Build: ${buildId}; verify: ${origin}/inventory-version.json`)
