import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, loadConfigFromFile, loadEnv } from 'vite'
import { parse } from '../server/node_modules/dotenv/lib/main.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)
const existing = loadEnv('production', root, 'VITE_')
const server = parse(fs.readFileSync('server/.env'))
const token = server.INVENTORY_ACCESS_CODE?.trim()
if (!token || token === server.ADMIN_ACCESS_CODE?.trim()) throw new Error('Separate field token required')
// Do not inherit local development administrator credentials into public bundles.
for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key]
for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
  process.env[key] = existing[key] || ''
}
process.env.VITE_INVENTORY_TOKEN = token
process.env.VITE_API_URL = ''
process.env.VITE_INVENTORY_API_URL = ''
process.env.VITE_INVENTORY_PUBLIC_APP_URL = '/inventory.html'
process.env.VITE_LOCAL_STORAGE_SECRET = ''
for (const portal of ['admin', 'user']) {
  process.env.VITE_LOGIN_PORTAL = portal
  const builtAt = new Date().toISOString()
  const buildId = `${portal}-${builtAt.replace(/[-:.]/g, '')}`
  process.env.VITE_INVENTORY_BUILD_ID = buildId
  process.env.VITE_INVENTORY_BUILT_AT = builtAt
  process.env.VITE_APP_VERSION_URL = `/${portal}/app-version.json`
  const loaded = await loadConfigFromFile({ command: 'build', mode: portal }, path.join(root, 'vite.config.ts'))
  if (!loaded) throw new Error('Missing Vite configuration')
  await build({ ...loaded.config, configFile: false, envDir: false, mode: portal, base: `/${portal}/`,
    build: { ...loaded.config.build, outDir: `.runtime/portals/${portal}`,
      rollupOptions: { input: { main: path.join(root, 'index.html') } } },
  })
  fs.writeFileSync(`.runtime/portals/${portal}/app-version.json`, JSON.stringify({ buildId, builtAt }))
  if (portal === 'admin') {
    // Separate home-screen name so USER and ADMIN installs are distinguishable (see LoginPage HOME_SCREEN_NAME).
    const manifestPath = `.runtime/portals/${portal}/manifest.webmanifest`
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    Object.assign(manifest, { name: 'EBS AI 허브 관리자', short_name: 'AI 허브 관리자' })
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    const htmlPath = `.runtime/portals/${portal}/index.html`
    fs.writeFileSync(htmlPath, fs.readFileSync(htmlPath, 'utf8')
      .replace('name="apple-mobile-web-app-title" content="EBS AI 허브"', 'name="apple-mobile-web-app-title" content="AI 허브 관리자"'))
  }
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)])
  for (const file of walk(`.runtime/portals/${portal}`).filter(file => /\.(js|html|json)$/.test(file))) {
    const text = fs.readFileSync(file, 'utf8')
    for (const secret of [server.ADMIN_ACCESS_CODE, server.JWT_SECRET, existing.VITE_LOCAL_STORAGE_SECRET]) {
      if (secret?.length > 8 && text.includes(secret)) throw new Error(`Private credential found in ${file}`)
    }
  }
  console.log(`Public ${portal} portal built; private credential check passed.`)
}
