// Browser regression: requires the user Vite server on port 5173 and Chrome.
// Uses a temporary profile and synthetic camera streams; no physical camera access.
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile=await mkdtemp(path.join(tmpdir(),'inventory-qr-check-'));
const proc=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--no-first-run','--ignore-certificate-errors','--remote-debugging-port=9339','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const timer=setInterval(()=>{},1000);
let ws;
try{
let targets;for(let i=0;i<60;i++){try{targets=await(await fetch('http://127.0.0.1:9339/json')).json();break}catch{await pause(100)}}
ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let id=0;const pending=new Map();ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result)}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});ws.send(JSON.stringify({id:next,method,params}))});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value};
await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await send('Page.navigate',{url:'https://localhost:5173/inventory.html'});await pause(1500);
await evaluate(`(async()=>{
 const React=(await import('/node_modules/.vite/deps/react.js')).default;
 const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
 const {default:Banner}=await import('/src/apps/inventory/InventoryInstallBanner.tsx');
 document.body.innerHTML='<div id="install-test"></div>';
 window.testRoot=createRoot(document.getElementById('install-test'));
 testRoot.render(React.createElement(Banner));
})()`);await pause(150);
await evaluate(`document.querySelector('#install-test button').click()`);await pause(100);
if(!await evaluate(`Boolean(document.querySelector('#install-test [role="status"]'))`))throw Error('Missing manual install instructions');
await evaluate(`window.promptCalls=0;const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{promptCalls++};e.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(e)`);await pause(100);
await evaluate(`document.querySelector('#install-test button').click()`);await pause(150);
if(await evaluate('promptCalls')!==1)throw Error('Native install prompt was not invoked');
if(!await evaluate(`Boolean(document.querySelector('#install-test button'))`))throw Error('Dismissal incorrectly marked installed');
await evaluate(`document.querySelector('#install-test button').click()`);await pause(100);
if(await evaluate('promptCalls')!==1)throw Error('One-shot install prompt reused');
await evaluate(`window.dispatchEvent(new Event('appinstalled'))`);await pause(100);
if(await evaluate(`Boolean(document.querySelector('#install-test button'))`))throw Error('Installed banner still visible');
console.log('PASS manual guidance, native prompt, dismissal, one-shot event and installed state');
await send('Browser.close');
}finally{clearInterval(timer);ws?.close();proc.kill()}
