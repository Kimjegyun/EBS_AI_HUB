// Run with both Vite portals running: node scripts/test-workspace-persistence.mjs
// Uses a separate headless Chrome profile; never touches the user's browser data.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const profile = await mkdtemp(path.join(tmpdir(), 'ai-hub-persistence-test-'))
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const debugPort = 9338
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sockets = []
const keepAlive = setInterval(() => {}, 1000)
let processHandle
async function startBrowser() {
  processHandle = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--ignore-certificate-errors',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  for (let i = 0; i < 100; i++) {
    try { return await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json() } catch { await pause(100) }
  }
  throw new Error('Chrome did not start')
}
async function connect(url) {
  const ws = new WebSocket(url)
  sockets.push(ws)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let serial = 0
  const pending = new Map()
  const handlers = new Map()
  ws.onclose = () => {
    for (const request of pending.values()) request.reject(new Error('CDP connection closed'))
    pending.clear()
  }
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) {
      const request = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) request?.reject(new Error(JSON.stringify(message.error)))
      else request?.resolve(message.result)
    } else handlers.get(message.method)?.(message.params)
  }
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        if (process.env.DEBUG_CDP) console.log(method)
        const id = ++serial
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
    },
    on(method, callback) { handlers.set(method, callback) },
  }
}
async function page(mode, seed) {
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json()
  const cdp = await connect(target.webSocketDebuggerUrl)
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => console.error('Browser exception:', exceptionDetails.exception?.description || exceptionDetails.text))
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await cdp.send('Network.enable')
  await cdp.send('Network.setBlockedURLs', { urls: ['*://*.supabase.co/*', '*://*.googleapis.com/*', '*://*.googleusercontent.com/*'] })
  cdp.on('Fetch.requestPaused', async ({ requestId, request }) => {
    const remote = request.url.endsWith('/remote')
    const body = request.url.includes('/bundle')
      ? 'export default ({React}) => ({Body: () => React.createElement("div", null, "REMOTE_FIXTURE_READY"), defaultSize: {w:4,h:3,minW:2,minH:2}})'
      : JSON.stringify(remote ? [{ id: 'test-remote', name: 'Remote fixture', version: '1', category: 'AI' }] : ['notes', 'test-remote'])
    if (remote) await pause(1200)
    await cdp.send('Fetch.fulfillRequest', { requestId, responseCode: 200, body: Buffer.from(body).toString('base64') })
  })
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/apps/published' }, { urlPattern: '*/api/apps/remote*' }] })
  const evaluate = async (expression) => {
    const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const origin = `https://localhost:${mode === 'admin' ? 5174 : 5173}`
  if (seed) {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      if (location.origin === ${JSON.stringify(origin)} && !localStorage.getItem('fixture-seeded')) {
        const prefix = 'ai-hub:${mode}:fixture:';
        localStorage.setItem('ai-hub:${mode}:ai-hub-auth', JSON.stringify({userId:'fixture', email:'fixture@example.test', role:'${mode}', displayName:'Fixture', status:'approved'}));
        for (const key of ['dashboard-installed-apps','dashboard-active-widgets']) localStorage.setItem(prefix + key, JSON.stringify(['notes','test-remote']));
        localStorage.setItem(prefix + 'dashboard-layouts', JSON.stringify({lg:[{i:'notes',x:0,y:0,w:8,h:4,minW:3,minH:2},{i:'test-remote',x:8,y:0,w:4,h:4,minW:2,minH:2}]}));
        localStorage.setItem('ai-hub:${mode}:dashboard-layouts', JSON.stringify({lg:[{i:'notes',x:0,y:0,w:12,h:3}]}));
        localStorage.setItem(prefix + 'last-page', '/installed-apps');
        localStorage.setItem('fixture-seeded','1');
      }` })
  }
  const navigate = (pathname) => cdp.send('Page.navigate', { url: origin + pathname })
  const waitFor = async (expression) => {
    for (let i = 0; i < 150; i++) {
      if (await evaluate(expression)) return
      await pause(100)
    }
    throw new Error(`Timeout: ${expression}; ${await evaluate('location.pathname + document.body.innerText.slice(0,500)')}`)
  }
  await navigate('/')
  await waitFor(`location.pathname === '/installed-apps' && document.body.innerText.includes('Remote fixture')`)
  await navigate('/dashboard')
  await waitFor(`document.body.innerText.includes('REMOTE_FIXTURE_READY')`)
  await pause(400)
  const snapshot = await evaluate(`({installed:JSON.parse(localStorage.getItem('ai-hub:${mode}:fixture:dashboard-installed-apps')), active:JSON.parse(localStorage.getItem('ai-hub:${mode}:fixture:dashboard-active-widgets')), layout:JSON.parse(localStorage.getItem('ai-hub:${mode}:fixture:dashboard-layouts'))})`)
  assert.deepEqual(snapshot.installed, ['notes', 'test-remote'])
  assert.deepEqual(snapshot.active, ['notes', 'test-remote'])
  assert.equal(snapshot.layout.lg.find((item) => item.i === 'notes').w, 8)
  assert.equal(snapshot.layout.lg.find((item) => item.i === 'test-remote').x, 8)
  // Maximized remote app must survive loading before its registry entry exists.
  await evaluate(`localStorage.setItem('ai-hub:${mode}:fixture:dashboard-maximized-widget','test-remote')`)
  await cdp.send('Page.reload')
  await waitFor(`document.body.innerText.includes('REMOTE_FIXTURE_READY')`)
  assert.equal(await evaluate(`localStorage.getItem('ai-hub:${mode}:fixture:dashboard-maximized-widget')`), 'test-remote')
  await navigate('/installed-apps')
  await waitFor(`document.body.innerText.includes('Remote fixture')`)
  console.log(`PASS ${mode}: installed/active apps, delayed remote loading, saved layout, maximized app, last page`)
}
try {
  let browser = await connect((await startBrowser()).webSocketDebuggerUrl)
  for (const mode of ['admin', 'user']) await page(mode, true)
  const exited = new Promise((resolve) => processHandle.once('exit', resolve))
  await browser.send('Browser.close')
  await exited
  browser = await connect((await startBrowser()).webSocketDebuggerUrl)
  for (const mode of ['admin', 'user']) await page(mode, false)
  console.log('PASS full browser restart with the same persistent profile')
  await browser.send('Browser.close')
} finally {
  clearInterval(keepAlive)
  for (const ws of sockets) ws.close()
  processHandle?.kill()
}
