import express from '../server/node_modules/express/index.js'
import { pathToFileURL } from 'node:url'
import { proxyHttp, proxyUpgrade } from './portalProxy.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Separate gateway allows publishing portals without interrupting active surveys.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = express()
const gatewayPort = Number(process.env.PORTAL_GATEWAY_PORT || 3002)
const backendPortFile = path.join(root, '.runtime/portal-backend-port.txt')
const backendPort = Number(process.env.PORTAL_BACKEND_PORT || (fs.existsSync(backendPortFile) ? fs.readFileSync(backendPortFile, 'utf8').trim() : 3001))
app.disable('x-powered-by')
for (const portal of ['admin', 'user']) {
  const dir = path.join(root, '.runtime/portals', portal)
  app.use(`/${portal}`, express.static(dir, { index: false, setHeaders(res, file) {
    res.setHeader('Cache-Control', file.endsWith('.html') ? 'no-store' : 'public, max-age=3600')
  } }))
  app.get([`/${portal}`, `/${portal}/*`], (req, res) => {
    if (req.path === `/${portal}`) return res.redirect(302, `/${portal}/`)
    if (path.extname(req.path)) return res.status(404).end()
    res.setHeader('Cache-Control', 'no-store')
    return res.sendFile(path.join(dir, 'index.html'))
  })
}
app.get('/', (_req, res) => res.redirect('/user/'))
app.use(express.static(path.join(root, '.runtime/inventory-public'), { index: false, setHeaders(res, file) {
  if (/\.(html|json)$/.test(file) || file.endsWith('sw-inventory.js')) res.setHeader('Cache-Control', 'no-store')
} }))
// External applications own their routes and implementation in their own workspaces.
const applications = []
const moduleFile = path.join(root, '.runtime/portal-app-modules.json')
if (fs.existsSync(moduleFile)) {
  for (const modulePath of JSON.parse(fs.readFileSync(moduleFile, 'utf8'))) {
    try {
      const module = await import(pathToFileURL(modulePath).href)
      applications.push(module.createPortalApplication())
    } catch (error) {
      console.error('External application unavailable:', error.message)
    }
  }
}
for (const application of applications) app.use((req,res,next) => application.handle(req,res,next,proxyHttp))
// No catch-all backend publishing: only explicit application endpoints.
const publicAuthPaths = new Set([
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/verify-admin-code',
  '/api/auth/portal-config',
  '/api/auth/verify-ai-hub-session',
])
const authenticatedApi = /^\/api\/(inventory|apps|environment|users|holidays|events|ai|tencent|io-log)(\/|$)/
app.use((req, res, next) => {
  if (req.path === '/health' && req.method === 'GET') return next()
  if (publicAuthPaths.has(req.path) && req.method === 'POST') return next()
  if (req.path === '/api/auth/portal-config' && req.method === 'GET') return next()
  if (!authenticatedApi.test(req.path)) return res.status(404).json({ error: 'Not published' })
  // Browser preflight contains no bearer token; upstream validates allowed origins.
  if (req.method === 'OPTIONS') return next()
  if (!/^Bearer\s+\S+$/i.test(req.headers.authorization ?? '')) return res.status(401).json({ error: 'Authentication required' })
  // Backend validates token signatures/codes and endpoint-specific roles.
  return next()
})
app.use((req,res) => proxyHttp(req,res,backendPort))
const gateway = app.listen(gatewayPort, '127.0.0.1', () => console.log(`Public portals gateway: http://127.0.0.1:${gatewayPort}`))
gateway.on('upgrade', (req,socket,head) => {
  socket.on('error', () => socket.destroy())
  for (const application of applications) if (application.upgrade(req,socket,head,proxyUpgrade)) return
  socket.destroy()
})
