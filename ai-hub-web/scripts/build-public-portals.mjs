import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, loadConfigFromFile, loadEnv } from 'vite'
import { parse } from '../server/node_modules/dotenv/lib/main.js'
import { renderDeveloperGuide } from './render-developer-guide.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const portalsOutDir = process.env.PORTALS_OUT_DIR || '.runtime/portals'
process.chdir(root)
const developerGuideHtml = renderDeveloperGuide(fs.readFileSync('developer-kit/APP_DEVELOPER_GUIDE.md', 'utf8'))
const publicGuidePath = path.join(root, 'public/developer-kit/guide/index.html')
fs.mkdirSync(path.dirname(publicGuidePath), { recursive: true })
fs.writeFileSync(publicGuidePath, developerGuideHtml, 'utf8')
const existing = loadEnv('production', root, 'VITE_')
const server = parse(fs.readFileSync('server/.env'))
// Do not inherit local development administrator credentials into public bundles.
for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key]
for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
  process.env[key] = server[key.replace('VITE_', '')] || existing[key] || ''
}
process.env.VITE_INVENTORY_TOKEN = ''
process.env.VITE_API_URL = ''
process.env.VITE_INVENTORY_API_URL = ''
process.env.VITE_INVENTORY_PUBLIC_APP_URL = '/inventory.html'
process.env.VITE_LOCAL_STORAGE_SECRET = ''
for (const portal of ['admin', 'user']) {
  process.env.VITE_LOGIN_PORTAL = portal
  process.env.VITE_WEB_PUSH_PUBLIC_KEY = portal === 'admin'
    ? server.WEB_PUSH_PUBLIC_KEY || existing.VITE_WEB_PUSH_PUBLIC_KEY || ''
    : ''
  const builtAt = new Date().toISOString()
  const buildId = `${portal}-${builtAt.replace(/[-:.]/g, '')}`
  process.env.VITE_INVENTORY_BUILD_ID = buildId
  process.env.VITE_INVENTORY_BUILT_AT = builtAt
  process.env.VITE_APP_VERSION_URL = `/${portal}/app-version.json`
  const loaded = await loadConfigFromFile({ command: 'build', mode: portal }, path.join(root, 'vite.config.ts'))
  if (!loaded) throw new Error('Missing Vite configuration')
  await build({ ...loaded.config, configFile: false, envDir: false, mode: portal, base: `/${portal}/`,
    build: { ...loaded.config.build, outDir: path.join(portalsOutDir, portal),
      rollupOptions: { input: { main: path.join(root, 'index.html') } } },
  })
  fs.writeFileSync(path.join(portalsOutDir, portal, 'app-version.json'), JSON.stringify({ buildId, builtAt }))
  if (portal === 'admin') {
    // Separate home-screen name so USER and ADMIN installs are distinguishable (see LoginPage HOME_SCREEN_NAME).
    const manifestPath = path.join(portalsOutDir, portal, 'manifest.webmanifest')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    Object.assign(manifest, { name: 'EBS AI 허브 관리자', short_name: 'AI 허브 관리자' })
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    const htmlPath = path.join(portalsOutDir, portal, 'index.html')
    fs.writeFileSync(htmlPath, fs.readFileSync(htmlPath, 'utf8')
      .replace('name="apple-mobile-web-app-title" content="EBS AI 허브"', 'name="apple-mobile-web-app-title" content="AI 허브 관리자"'))
  }
  if (portal === 'admin') {
    const approvalDir = path.join(portalsOutDir, portal, 'approvals')
    const adminHtml = fs.readFileSync(path.join(portalsOutDir, portal, 'index.html'), 'utf8')
    const approvalHtml = adminHtml.replace(/(<link\s+rel="manifest"\s+href=")[^"]+("\s*\/?\s*>)/, '$1/admin/approval-app.webmanifest?v=4$2')
    if (!approvalHtml.includes('href="/admin/approval-app.webmanifest?v=4"')) {
      throw new Error('Could not create an install page with the dedicated approval manifest.')
    }
    fs.mkdirSync(approvalDir, { recursive: true })
    fs.writeFileSync(path.join(approvalDir, 'app.html'), approvalHtml, 'utf8')
  }
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)])
  for (const file of walk(path.join(portalsOutDir, portal)).filter(file => /\.(js|html|json)$/.test(file))) {
    const text = fs.readFileSync(file, 'utf8')
    for (const secret of [server.ADMIN_ACCESS_CODE, server.INVENTORY_ACCESS_CODE, server.JWT_SECRET, existing.VITE_LOCAL_STORAGE_SECRET]) {
      if (secret?.length > 8 && text.includes(secret)) throw new Error(`Private credential found in ${file}`)
    }
  }
  console.log(`Public ${portal} portal built; private credential check passed.`)
}
