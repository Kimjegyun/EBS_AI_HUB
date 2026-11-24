import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const origin = process.env.UTILITY_TEST_ORIGIN || 'https://ebs-aihub.com'
const browser = [path.join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'), path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe')].find(fs.existsSync)
if (!browser) throw new Error('Chrome or Edge required')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aihub-util-browser-'))
const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile, '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let socket
try {
  const portFile = path.join(profile, 'DevToolsActivePort')
  for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await pause(100)
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim()
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  socket = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let sequence = 0
  const pending = new Map()
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    const item = pending.get(message.id)
    if (!item) return
    pending.delete(message.id); clearTimeout(item.timer)
    if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser timeout')) }, 15000)
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }))
  })
  await send('Page.enable')
  await send('Page.navigate', { url: `${origin}/util` })
  let text = ''
  for (let i = 0; i < 60; i++) {
    await pause(250)
    text = (await send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true })).result.value || ''
    if (text.includes('유틸리티를 준비하고 있습니다')) break
  }
  assert.ok(text.includes('유틸리티 자료실'), 'Public utilities heading must render')
  assert.ok(text.includes('유틸리티를 준비하고 있습니다'), 'Empty public catalog must render without login')
  const url = (await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true })).result.value
  assert.equal(url, `${origin}/util`)
  const api = await fetch(`${origin}/api/utilities`)
  assert.equal(api.status, 200)
  assert.ok(Array.isArray(await api.json()))
  assert.equal((await fetch(`${origin}/api/utilities`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401)
  if (process.argv.includes('--security')) {
    const appCode = `export default ({React}) => ({Body(){
      React.useEffect(()=>{(async()=>{
        let parentBlocked=false,storageBlocked=false,networkBlocked=false;
        try{void parent.document.body}catch{parentBlocked=true}
        try{void localStorage.getItem('sandbox-host-test')}catch{storageBlocked=true}
        try{await fetch('${origin}/api/environment')}catch{networkBlocked=true}
        parent.postMessage({type:'security-proof',parentBlocked,storageBlocked,networkBlocked},'*');
      })()},[]);
      return React.createElement('p',null,'Sandbox test application');
    }})`
    const expression = `(()=>{
      window.__sandboxProof=null;
      const f=document.createElement('iframe'); f.sandbox='allow-scripts';
      window.addEventListener('message',e=>{
        if(e.source!==f.contentWindow)return;
        if(e.data?.type==='aihub:ready')f.contentWindow.postMessage({type:'aihub:init',channel:'security-test',code:${JSON.stringify(appCode)},context:{isAdmin:false,maximized:false},storage:null},'*');
        if(e.data?.type==='security-proof')window.__sandboxProof=e.data;
        if(e.data?.type==='aihub:error')window.__sandboxProof={error:e.data.message};
      });
      f.srcdoc='<meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; script-src ${origin} blob:; style-src &apos;unsafe-inline&apos;; connect-src &apos;none&apos;"><div id="root"></div><script src="${origin}/user/remote-app-runtime.js"></script>';
      document.body.append(f);
    })()`
    await send('Runtime.evaluate', { expression })
    let proof
    for (let i = 0; i < 80; i++) {
      await pause(200)
      proof = (await send('Runtime.evaluate', { expression: 'window.__sandboxProof', returnByValue: true })).result.value
      if (proof) break
    }
    assert.deepEqual(proof, { type: 'security-proof', parentBlocked: true, storageBlocked: true, networkBlocked: true })
    const headers = await fetch(`${origin}/util`)
    assert.ok(headers.headers.get('content-security-policy'))
    assert.equal(headers.headers.get('x-content-type-options'), 'nosniff')
    console.log('PASS: sandbox blocks parent document, host storage and undeclared network access; gateway security headers are present.')
  }
  console.log('PASS: /util renders publicly at its original URL; catalog API works; anonymous publication is denied.')
} finally {
  socket?.close()
  child.kill()
  // Leave the isolated temporary profile for the OS to clean up after browser shutdown.
}
