// Isolated browser fixture: no production records are changed.
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
const profile = await mkdtemp(path.join(tmpdir(), 'inventory-export-'))
const proc = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--ignore-certificate-errors', '--remote-debugging-port=9340', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let ws
try {
  let targets
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch('http://127.0.0.1:9340/json')).json(); break } catch { await pause(100) } }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let id = 0
  const pending = new Map()
  ws.onmessage = ({ data }) => { const m = JSON.parse(data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result) } }
  const send = (method, params = {}) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); ws.send(JSON.stringify({ id: next, method, params })) })
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value }
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await send('Page.navigate', { url: 'https://localhost:5173/inventory.html' })
  await pause(1800)
  console.log(await evaluate(`(async () => {
    const source = await (await fetch('/src/apps/inventory/PublishedSubmissionDownload.tsx')).text();
    const React = (await import(source.match(/from ["']([^"']*react.js[^"']*)["']/)[1])).default;
    const {createRoot} = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    if (!window.__vite_plugin_react_preamble_installed__) { const refresh=(await import('/@react-refresh')).default; refresh.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true; }
    const Component = (await import('/src/apps/inventory/PublishedSubmissionDownload.tsx')).default;
    const realFetch = window.fetch;
    window.exportRows = [
      {assetNo:'A',parentDept:'융합기술본부',verifierDept:'AI기술기획부',verifier:'김테스트'},
      {assetNo:'B',parentDept:'융합기술본부',verifierDept:'AI기술기획부',verifier:'이테스트'},
      {assetNo:'C',parentDept:'융합기술본부',verifierDept:'다른부서',verifier:'김테스트'},
      {assetNo:'D',parentDept:'다른본부',verifierDept:'AI기술기획부',verifier:'김테스트'}
    ];
    window.fetch = (input, init) => String(input).includes('/results/export') ? Promise.resolve(new Response(JSON.stringify(window.exportError ? {error:'test unavailable'} : {rows:window.exportRows}), {status:window.exportError ? 503 : 200})) : realFetch(input, init);
    document.getElementById('root').style.display='none';
    const host=document.createElement('main'); host.id='export-test'; host.style.padding='12px'; document.body.append(host);
    createRoot(host).render(React.createElement(Component));
    const wait=()=>new Promise(r=>setTimeout(r,150)); await wait();
    const select=async(label,value)=>{const el=host.querySelector('select[aria-label="'+label+'"]'); if(el.disabled)throw Error(label+' disabled'); el.value=value; el.dispatchEvent(new Event('change',{bubbles:true})); await wait();};
    const count=n=>{if(!host.textContent.includes('선택 결과 '+n+'건'))throw Error('Incorrect count '+n+': '+host.textContent)};
    count(4);
    await select('조사부서','AI기술기획부'); count(3);
    await select('입력자','김테스트'); count(2);
    await select('본부','융합기술본부'); count(3);
    if(host.querySelector('select[aria-label="조사부서"]').value || host.querySelector('select[aria-label="입력자"]').value)throw Error('Child filters not reset');
    await select('조사부서','AI기술기획부'); await select('입력자','이테스트'); count(1);
    let blob; URL.createObjectURL=value=>{blob=value; return 'blob:test'}; HTMLAnchorElement.prototype.click=function(){};
    [...host.querySelectorAll('button')].find(b=>b.textContent==='엑셀 다운로드').click();
    for(let i=0;i<100&&!host.textContent.includes('1건 내보내기 완료');i++)await wait();
    if(!blob || !host.textContent.includes('1건 내보내기 완료'))throw Error('Download failed');
    const ExcelJS=(await import('/node_modules/.vite/deps/exceljs.js')).default;
    const book=new ExcelJS.Workbook(); await book.xlsx.load(await blob.arrayBuffer());
    if(book.worksheets[0].rowCount!==2 || book.worksheets[0].getCell('D2').value!=='B')throw Error('Wrong downloaded data');
    window.exportRows=[]; [...host.querySelectorAll('button')].find(b=>b.textContent==='새로고침').click(); await wait(); count(0);
    if(![...host.querySelectorAll('button')].find(b=>b.textContent==='엑셀 다운로드').disabled)throw Error('Empty download enabled');
    window.exportError=true; [...host.querySelectorAll('button')].find(b=>b.textContent==='새로고침').click(); await wait();
    if(!host.querySelector('[role=alert]'))throw Error('Missing error');
    window.exportError=false; window.exportRows=[{assetNo:'B',parentDept:'융합기술본부',verifierDept:'AI기술기획부',verifier:'이테스트'}];
    [...host.querySelectorAll('button')].find(b=>b.textContent==='새로고침').click(); await wait(); count(1);
    return 'PASS department/person direct selection, cascading reset, filtered XLSX download, empty results, error/retry';
  })()`))
  for (const width of [320, 390, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 600 })
    await pause(100)
    console.log(await evaluate(`(() => {const host=document.querySelector('#export-test'); const controls=[...host.querySelectorAll('select,input,button')]; if(host.scrollWidth>host.clientWidth || controls.some(el=>{const r=el.getBoundingClientRect(); return r.left<0 || r.right>${width};}))throw Error('Overflow at ${width}'); return 'PASS layout ${width}px';})()`))
    if (width === 390) {
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      await writeFile('.runtime/export-mobile-check.png', Buffer.from(shot.data, 'base64'))
    }
  }
  await send('Browser.close')
} finally { ws?.close(); proc.kill() }
