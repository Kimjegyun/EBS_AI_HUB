import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createServer } from 'vite'

// Isolated browser fixtures: no production account, API keys or real AI calls.
const vite = await createServer({ configFile: false, envDir: false, root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'resource-test-page', configureServer(server) {
  server.middlewares.use('/__resource-test', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><body><div id="root"></div></body></html>') })
} }] })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = [path.join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'), path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe')].find(fs.existsSync)
if (!browser) throw Error('Chrome or Edge required')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-resource-check-'))
const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + profile, '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket
try {
  const file = path.join(profile, 'DevToolsActivePort')
  for (let n = 0; !fs.existsSync(file) && n < 120; n++) await pause(100)
  const port = fs.readFileSync(file, 'utf8').split('\n')[0].trim()
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let id = 0
  const pending = new Map()
  socket.onmessage = event => {
    const message = JSON.parse(event.data), item = pending.get(message.id)
    if (!item) return
    pending.delete(message.id); clearTimeout(item.timer)
    if (message.error) item.reject(Error(message.error.message)); else item.resolve(message.result)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error('Browser timeout: ' + method)) }, 45000)
    pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params }))
  })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  await send('Page.enable')
  await send('Page.navigate', { url: origin + '/__resource-test' })
  for (let n = 0; n < 100; n++) { if (await evaluate('document.readyState==="complete"')) break; await pause(50) }
  const results = await evaluate(`(async()=>{
    const {encodePcmWav,prepareBrowserAudio,testBrowserResources}=await import('/src/lib/browserAudio.ts');
    const {validatePreparedAudio}=await import('/server/src/lib/resourcePolicy.ts');
    const {readWorkbookLocally,readWorkbookByPolicy}=await import('/src/lib/resourceExecution.ts');
    const XLSX=await import('/node_modules/xlsx/xlsx.mjs');
    const check=(value,message)=>{if(!value)throw Error(message)};
    await testBrowserResources();
    const raw=encodePcmWav(new Float32Array(16000*121).fill(0.15)),sizes=[];
    for await(const part of prepareBrowserAudio(new File([raw],'fixture.wav',{type:'audio/wav'}))){
      check(validatePreparedAudio(new Uint8Array(await part.arrayBuffer())),'Generated audio must pass server format checks');sizes.push(part.size);
    }
    check(sizes.length===2&&sizes[0]===3840044&&sizes[1]===32044,'120-second segmentation must preserve the tail');
    let unsupported=false;try{for await(const ignored of prepareBrowserAudio(new File(['invalid'],'bad.mp3'))){void ignored}}catch{unsupported=true}
    check(unsupported,'Invalid audio must produce an actionable error');
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['자산번호','자산명'],['A-001','한국어 이름']]),'자산');
    const bytes=XLSX.write(wb,{type:'array',bookType:'xlsx'});
    const local=await readWorkbookLocally(bytes);check(local.Sheets['자산'].B2.v==='한국어 이름','Worker must preserve Korean cell values');check(bytes.byteLength>0,'Original buffer must remain available');
    let rejected=false;try{await readWorkbookLocally(new ArrayBuffer(21*1024*1024))}catch{rejected=true}check(rejected,'Oversized workbook must fail');
    const huge=XLSX.utils.book_new();XLSX.utils.book_append_sheet(huge,{A1:{t:'s',v:'test'},'!ref':'A1:A100001'},'TooLarge');
    rejected=false;try{await readWorkbookLocally(XLSX.write(huge,{type:'array',bookType:'xlsx'}))}catch{rejected=true}check(rejected,'Extreme worksheet ranges must fail');
    let mode='user',uploads=0,fail=false;const native=fetch;
    window.fetch=async(input,init)=>{
      if(String(input)==='/api/resources')return new Response(JSON.stringify(fail?{error:'offline'}:{policy:{audioMode:'user',workbookMode:mode,maxConcurrent:2}}),{status:fail?503:200});
      if(String(input)==='/api/resources/workbook'){uploads++;return new Response(JSON.stringify({workbook:wb}));}
      return native(input,init);
    };
    check((await readWorkbookByPolicy(bytes)).Sheets['자산'].B2.v==='한국어 이름','User mode read failed');check(uploads===0,'User mode must not upload workbook');
    mode='central';check((await readWorkbookByPolicy(bytes)).Sheets['자산'].B2.v==='한국어 이름','Central read failed');check(uploads===1,'Central mode must upload exactly once');
    mode='user';Object.defineProperty(navigator,'userAgent',{get:()=> 'Mozilla/5.0 (iPad; CPU OS 18_0) Mobile',configurable:true});Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8,configurable:true});
    await readWorkbookByPolicy(bytes);check(uploads===1,'Small mobile workbook must remain local');
    await readWorkbookByPolicy(new ArrayBuffer(2*1024*1024+1));check(uploads===2,'Large mobile workbook must use central processing');
    fail=true;rejected=false;try{await readWorkbookByPolicy(bytes)}catch{rejected=true}check(rejected&&uploads===2,'Policy failure must not silently change execution mode');
    window.fetch=native;
    return {audioChunks:sizes,unicodeWorkbook:true,originalBufferPreserved:true,oversizeRejected:true,extremeRangeRejected:true,userModeUploads:0,centralModeUploads:1,mobileHeavyWorkbookUploads:1,policyFailureClosed:true,invalidAudioRejected:true};
  })()`)
  assert.equal(results.audioChunks.length, 2)

  // Exercise the actual published SettingsPage with mocked server responses only.
  const portal = process.env.PORTAL_TEST_ORIGIN || 'http://127.0.0.1:3002'
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(portal)}){
    localStorage.setItem('ai-hub:admin:ai-hub-auth',JSON.stringify({userId:'resource-ui-fixture',role:'admin',status:'approved',email:'resource@example.invalid',displayName:'자원 설정 검사'}));
    localStorage.setItem('ai-hub:admin:ai-hub-runtime-supabase-config-v1',JSON.stringify({url:'https://auth.fixture.invalid',anonKey:'fixture'}));
    localStorage.setItem('ai-hub:user:ai-hub-auth',JSON.stringify({userId:'resource-ui-fixture',role:'admin',status:'approved',email:'resource@example.invalid',displayName:'음성 처리 검사'}));
    localStorage.setItem('ai-hub:user:ai-hub-runtime-supabase-config-v1',JSON.stringify({url:'https://auth.fixture.invalid',anonKey:'fixture'}));
    for(const key of ['dashboard-active-widgets','dashboard-installed-apps'])localStorage.setItem('ai-hub:user:resource-ui-fixture:'+key,'["voice-summary"]');
    window.__resourcePolicy={audioMode:new URLSearchParams(location.search).get('mode')||'central',workbookMode:'user',maxConcurrent:2};window.__resourceSaves=0;window.__speechUploads=[];const native=fetch;
    window.fetch=async(input,init)=>{
      const url=new URL(input instanceof Request?input.url:String(input),location.href);
      if(url.hostname==='auth.fixture.invalid')return new Response('[]',{headers:{'Content-Type':'application/json'}});
      if(url.origin===location.origin&&url.pathname.startsWith('/api/')){
        let body=[];
        if(url.pathname==='/api/resources'||url.pathname==='/api/resources/status'){
          if(init?.method==='PUT'){window.__resourcePolicy=JSON.parse(init.body).policy;window.__resourceSaves++;}
          body={policy:window.__resourcePolicy,active:0};
        }
        if(url.pathname==='/api/apps/published')body={appIds:['voice-summary']};
        if(url.pathname==='/api/ai/transcribe'){
          const part=init.body.get('file'),bytes=await part.arrayBuffer(),view=new DataView(bytes);
          window.__speechUploads.push({name:part.name,size:part.size,rate:view.getUint32(24,true),channels:view.getUint16(22,true),mobileCentral:init.headers['X-AIHub-Execution']==='mobile-central'});
          body={ok:true,text:'검증된 음성 원문 '+window.__speechUploads.length};
        }
        return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
      }
      return native(input,init);
    };
  }` })
  await send('Page.navigate', { url: portal + '/admin/settings' })
  for (let n = 0; n < 100; n++) { if (await evaluate('!!document.querySelector("[aria-label=\\"음성 변환·분할\\"]")')) break; await pause(100) }
  assert.ok(await evaluate('!!document.querySelector("[aria-label=\\"작업 자원 설정\\"]")'), 'SettingsPage must contain resource controls')
  await evaluate(`(()=>{const element=document.querySelector('[aria-label="음성 변환·분할"]');element.value='user';element.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await pause(100)
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='저장 및 적용').click()`)
  await pause(150)
  assert.equal(await evaluate('window.__resourcePolicy.audioMode'), 'user')
  assert.equal(await evaluate('window.__resourceSaves'), 1)
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='현재 PC 처리 검사').click()`)
  for (let n = 0; n < 100; n++) { if (await evaluate(`document.querySelector('[aria-label="작업 자원 설정"]').textContent.includes('Worker 검증을 통과')`)) break; await pause(100) }
  assert.ok(await evaluate(`document.querySelector('[aria-label="작업 자원 설정"]').textContent.includes('Worker 검증을 통과')`), 'Published browser diagnostic must pass')
  for (const width of [1440, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 })
    await pause(100)
    const layout = await evaluate(`(()=>{const panel=document.querySelector('[aria-label="작업 자원 설정"]');return {width:panel.clientWidth,scroll:panel.scrollWidth}})()`)
    assert.ok(layout.scroll <= layout.width + 1, 'Resource controls must fit at ' + width)
  }
  const voicePaths = []
  const desktopAgent = await evaluate('navigator.userAgent')
  for (const { mode, mobile, seconds } of [{mode:'user',mobile:false,seconds:121},{mode:'central',mobile:false,seconds:121},{mode:'user',mobile:true,seconds:181},{mode:'user',mobile:true,seconds:5}]) {
    await send('Network.setUserAgentOverride', { userAgent: mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' : desktopAgent })
    await send('Page.navigate', { url: portal + '/user/dashboard?mode=' + mode })
    await evaluate(`Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8,configurable:true})`)
    for (let n = 0; n < 100; n++) { if (await evaluate('!!document.querySelector(".voice-summary input[type=file]")')) break; await pause(100) }
    assert.ok(await evaluate('!!document.querySelector(".voice-summary input[type=file]")'), 'Voice app must mount')
    await evaluate(`(()=>{
      const buffer=new ArrayBuffer(44+8000*${seconds}*2),view=new DataView(buffer);
      const text=(at,value)=>[...value].forEach((char,i)=>view.setUint8(at+i,char.charCodeAt(0)));
      text(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);
      view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);
      view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,buffer.byteLength-44,true);
      const transfer=new DataTransfer();transfer.items.add(new File([buffer],'source.wav',{type:'audio/wav'}));
      const input=document.querySelector('.voice-summary input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    })()`)
    for (let n = 0; n < 100; n++) { if (await evaluate(`Array.from(document.querySelectorAll('.voice-summary button')).some(button=>button.textContent.includes('음성 인식 시작')&&!button.disabled)`)) break; await pause(100) }
    await evaluate(`Array.from(document.querySelectorAll('.voice-summary button')).find(button=>button.textContent.includes('음성 인식 시작')&&!button.disabled).click()`)
    for (let n = 0; n < 150; n++) { if (await evaluate(`document.querySelector('.voice-summary').textContent.includes('음성 인식을 완료했습니다.')`)) break; await pause(100) }
    assert.ok(await evaluate(`document.querySelector('.voice-summary').textContent.includes('음성 인식을 완료했습니다.')`), 'Voice transcription flow must complete: ' + mode)
    const uploads = await evaluate('window.__speechUploads')
    const local = mode === 'user' && !(mobile && seconds > 180)
    assert.equal(uploads.length, local && seconds > 120 ? 2 : 1)
    assert.ok(uploads.every(part => part.rate === (local ? 16000 : 8000) && part.channels === 1))
    assert.ok(uploads.every(part => part.mobileCentral === (mobile && !local)))
    if (local && seconds > 120) assert.deepEqual(uploads.map(part => part.name), ['part-0001.wav', 'part-0002.wav'])
    voicePaths.push({ mode, mobile, seconds, uploads })
  }
  console.log(JSON.stringify({ ...results, publishedAdminSave: true, publishedBrowserDiagnostic: true, desktopAndMobileLayout: true, voicePaths, productionApiCalls: false }, null, 2))
} finally {
  socket?.close(); child.kill(); await vite.close()
}
