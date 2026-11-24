import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const origin = process.env.PORTAL_TEST_ORIGIN || 'https://ebs-aihub.com'
const output = path.resolve('.runtime', 'users-layout-' + Date.now())
fs.mkdirSync(output, { recursive: true })
const browser = [path.join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'), path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe')].find(fs.existsSync)
if (!browser) throw Error('Chrome or Edge required')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-users-layout-'))
const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + profile, '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let socket
try {
  const file = path.join(profile, 'DevToolsActivePort')
  for (let n = 0; !fs.existsSync(file) && n < 120; n++) await pause(100)
  const port = fs.readFileSync(file, 'utf8').split('\n')[0].trim()
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  socket = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let id = 0
  const pending = new Map()
  socket.onmessage = (event) => {
    const m = JSON.parse(event.data), item = pending.get(m.id)
    if (!item) return
    pending.delete(m.id); clearTimeout(item.timer)
    if (m.error) item.reject(Error(m.error.message)); else item.resolve(m.result)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error('Browser timeout')) }, 20000)
    pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text)
    return result.result.value
  }
  await send('Page.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    if(location.origin===${JSON.stringify(origin)}){
      window.__cspIssues=[];document.addEventListener('securitypolicyviolation',e=>window.__cspIssues.push({directive:e.effectiveDirective,blocked:e.blockedURI}));
      const portal=location.pathname.split('/')[1];
      localStorage.setItem('ai-hub:'+portal+':ai-hub-auth',JSON.stringify({userId:'layout-fixture',role:'admin',status:'approved',email:'layout@example.invalid',displayName:'레이아웃 점검'}));
      localStorage.setItem('ai-hub:'+portal+':ai-hub-runtime-supabase-config-v1',JSON.stringify({url:'https://auth.fixture.invalid',anonKey:'fixture'}));
      const native=window.fetch.bind(window);
      window.fetch=(input,init)=>{
        const url=new URL(input instanceof Request?input.url:String(input),location.href);
        if(url.hostname==='auth.fixture.invalid')return Promise.resolve(new Response('[]',{status:200,headers:{'Content-Type':'application/json'}}));
        if(url.origin===location.origin&&url.pathname.startsWith('/api/'))return Promise.resolve(new Response('{"error":"Synthetic fixture: production APIs disabled"}',{status:503,headers:{'Content-Type':'application/json'}}));
        return native(input,init);
      };
    }` })
  const results = []
  for (const { portal, width, height } of [{ portal: 'user', width: 1440, height: 1000 }, { portal: 'admin', width: 1440, height: 1000 }, { portal: 'user', width: 390, height: 844 }]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 })
    await send('Page.navigate', { url: `${origin}/${portal}/users` })
    for (let n = 0; n < 100; n++) {
      await pause(100)
      if (await evaluate("!!document.querySelector('table')")) break
    }
    await evaluate('document.fonts.ready')
    await pause(500)
    const state = await evaluate(`(()=>{
      const icon=document.querySelector('.material-symbols-outlined'),header=document.querySelector('header'),main=document.querySelector('.hub-content'),aside=document.querySelector('aside');
      const rect=e=>e?{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}:null;
      return {path:location.pathname,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,header:rect(header),main:rect(main),contentTop:main?main.getBoundingClientRect().y+parseFloat(getComputedStyle(main).paddingTop):null,aside:rect(aside),iconFont:icon?getComputedStyle(icon).fontFamily:null,iconWidth:icon?.getBoundingClientRect().width,csp:window.__cspIssues,fontLinks:Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(e=>({href:e.href,media:e.media})),loadedFonts:Array.from(document.fonts).filter(f=>f.status==='loaded').map(f=>f.family)};
    })()`)
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(path.join(output, `${portal}-${width}.png`), Buffer.from(screenshot.data, 'base64'))
    results.push(state)
  }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify({ output, results }, null, 2))
  if (!process.argv.includes('--inspect')) {
    for (const state of results) {
      assert.ok(state.path.endsWith('/users'))
      assert.ok(state.iconFont.includes('Material Symbols Outlined'), 'Icon font must apply on screen')
      assert.ok(state.iconWidth <= 40, 'Icon text must not expand navigation')
      assert.ok(!state.csp.some((item) => item.blocked === 'inline'), 'No blocked inline handlers')
      assert.ok(state.scrollWidth <= state.width + 1, 'Page must fit viewport')
      assert.ok(state.contentTop >= state.header.height - 1, 'Content must start below header')
      assert.ok(state.loadedFonts.includes('Material Symbols Outlined'), 'Self-hosted icon font must load')
    }
  }
} finally { socket?.close(); child.kill() }
