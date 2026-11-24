import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const origin = process.env.PORTAL_TEST_ORIGIN || 'https://ebs-aihub.com'
const output = path.resolve('.runtime', 'voice-summary-layout-' + Date.now())
fs.mkdirSync(output, { recursive: true })
const browser = [path.join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'), path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe')].find(fs.existsSync)
if (!browser) throw Error('Chrome or Edge required')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-voice-layout-'))
const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + profile, '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const cases = [
  { id: 'long', title: '아주긴제목'.repeat(150), overview: `https://example.test/${'long-unbroken-path'.repeat(120)}\n${'연속된한국어'.repeat(300)}`, keyPoints: ['하나의긴단어'.repeat(300)], actionItems: ['action'.repeat(300)] },
  { id: 'multiline', title: '긴 회의 요약', overview: Array.from({ length: 300 }, (_, i) => `${i + 1}번째 내용과 줄바꿈`).join('\n'), keyPoints: Array.from({ length: 80 }, (_, i) => `핵심 ${i + 1}\n두 번째 줄`), actionItems: ['후속 조치\n담당자 확인'] },
]
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
      const portal='user', user='voice-layout-fixture';
      localStorage.setItem('ai-hub:'+portal+':ai-hub-auth',JSON.stringify({userId:user,role:'admin',status:'approved',email:'voice-layout@example.invalid',displayName:'레이아웃 점검'}));
      localStorage.setItem('ai-hub:'+portal+':ai-hub-runtime-supabase-config-v1',JSON.stringify({url:'https://auth.fixture.invalid',anonKey:'fixture'}));
      for(const key of ['dashboard-active-widgets','dashboard-installed-apps'])localStorage.setItem('ai-hub:'+portal+':'+user+':'+key,'["voice-summary"]');
      localStorage.setItem('ai-hub:'+portal+':'+user+':dashboard-layouts',JSON.stringify({lg:[{i:'voice-summary',x:0,y:0,w:location.search.includes('wide=1')?12:5,h:7,minW:5,minH:5}]}));
      const native=window.fetch.bind(window);
      window.fetch=(input,init)=>{
        const url=new URL(input instanceof Request?input.url:String(input),location.href);
        if(url.hostname==='auth.fixture.invalid')return Promise.resolve(new Response('[]',{status:200,headers:{'Content-Type':'application/json'}}));
        if(url.origin===location.origin&&url.pathname.startsWith('/api/'))return Promise.resolve(new Response(url.pathname==='/api/apps/published'?'{"appIds":["voice-summary"]}':'[]',{status:200,headers:{'Content-Type':'application/json'}}));
        return native(input,init);
      };
      window.__voiceSeed=new Promise((resolve,reject)=>{
        const request=indexedDB.open('ebs-ai-hub-voice-summary',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('projects',{keyPath:'id'});
        request.onsuccess=()=>{const db=request.result,tx=db.transaction('projects','readwrite'),store=tx.objectStore('projects');
          for(const row of ${JSON.stringify(cases)})store.put({id:row.id,name:'매우긴프로젝트이름'.repeat(80),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),transcript:'원문 '.repeat(5000),summaryText:row.overview,summaryJson:JSON.stringify(row),files:[]});
          tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>reject(tx.error);
        };request.onerror=()=>reject(request.error);
      });
    }` })
  const results = []
  for (const { width, wide } of [{ width: 1440, wide: false }, { width: 1440, wide: true }, { width: 390, wide: false }]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 })
    await send('Page.navigate', { url: `${origin}/user/dashboard${wide ? '?wide=1' : ''}` })
    await evaluate('window.__voiceSeed')
    for (let n = 0; n < 100; n++) {
      await pause(100)
      if (await evaluate("Array.from(document.querySelectorAll('select')).some(e=>Array.from(e.options).some(o=>o.value==='long'))")) break
    }
    for (const item of cases) {
      await evaluate(`(()=>{const s=Array.from(document.querySelectorAll('select')).find(e=>Array.from(e.options).some(o=>o.value==='long'));s.value=${JSON.stringify(item.id)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
      await pause(400)
      const state = await evaluate(`(()=>{
        const select=Array.from(document.querySelectorAll('select')).find(e=>Array.from(e.options).some(o=>o.value==='long'));
        const root=select.closest('.no-drag'),content=root.querySelector('[aria-label="요약 결과"]')||root.querySelector('.space-y-3.overflow-auto');
        const section=content.closest('section'),footer=content.nextElementSibling;
        return {viewport:innerWidth,rootWidth:root.clientWidth,rootScrollWidth:root.scrollWidth,contentWidth:content.clientWidth,contentScrollWidth:content.scrollWidth,contentHeight:content.clientHeight,contentScrollHeight:content.scrollHeight,titleLength:content.querySelector('h3,h4')?.textContent.length,panes:Array.from(root.querySelectorAll('.voice-summary-columns>section')).map(e=>e.getBoundingClientRect().width),footerOutsideScroll:!!footer?.textContent.includes('복사'),footerContained:!!footer&&footer.getBoundingClientRect().bottom<=section.getBoundingClientRect().bottom,documentWidth:document.documentElement.scrollWidth};
      })()`)
      results.push({ case: item.id, wide, ...state })
      if (!process.argv.includes('--inspect')) {
        assert.ok(state.rootScrollWidth <= state.rootWidth + 1, 'App content must not expand widget width')
        assert.ok(state.contentScrollWidth <= state.contentWidth + 1, 'Summary must wrap long words and URLs')
        assert.ok(state.contentHeight <= 550 + 1, 'Long summary must scroll within a bounded area')
        assert.ok(state.footerOutsideScroll, 'Actions must be outside the long-text scroll area')
        assert.ok(state.footerContained, 'Actions must stay inside their panel without overlapping subsequent messages')
        assert.equal(state.titleLength, item.title.length, 'Full title must be preserved')
        if (wide) assert.ok(state.panes.every((pane) => pane < state.rootWidth * 0.6), 'Wide widgets must use two bounded columns')
      }
      if (item.id === 'multiline') { const shot = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, `${width}-${wide ? 'wide' : 'narrow'}.png`), Buffer.from(shot.data, 'base64')) }
    }
  }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify({ output, productionApiCalls: false, results }, null, 2))
} finally { socket?.close(); child.kill() }
