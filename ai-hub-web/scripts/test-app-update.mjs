// Session refresh regression using isolated browser storage and mocked API responses.
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
await send('Page.navigate',{url:'http://localhost:3002/inventory.html'});await pause(1800);
console.log(await evaluate(`(async()=>{
const wait=()=>new Promise(r=>setTimeout(r,150));
for(let i=0;i<80&&!document.querySelector('footer');i++)await wait();
const footer=document.querySelector('footer');if(!footer)throw Error('Footer missing');
const button=footer.querySelector('button');
for(let i=0;i<80&&button.disabled;i++)await wait();
button.click();await wait();for(let i=0;i<80&&button.disabled;i++)await wait();
if(!footer.textContent.includes('현재 최신 버전을 사용하고 있습니다.'))throw Error('Current version check failed');
const realFetch=window.fetch;let confirmations=0;
window.fetch=(input,init)=>String(input).includes('inventory-version.json')?Promise.resolve(new Response(JSON.stringify({buildId:'test-new-version'}))):realFetch(input,init);
window.confirm=()=>{confirmations++;return false};
button.click();await wait();for(let i=0;i<80&&button.disabled;i++)await wait();
if(confirmations!==1||!footer.textContent.includes('새 버전이 있습니다'))throw Error('Update confirmation missing');
window.fetch=(input,init)=>String(input).includes('inventory-version.json')?Promise.reject(new Error('offline')):realFetch(input,init);
button.click();await wait();for(let i=0;i<80&&button.disabled;i++)await wait();
if(!footer.textContent.includes('인터넷 연결 후 다시 시도'))throw Error('Offline handling failed');
if(footer.scrollWidth>footer.clientWidth)throw Error('Mobile overflow');
return 'PASS visible update button, current/outdated/offline states, cancel preserves page, mobile layout';
})()`));
await send('Browser.close');
}finally{clearInterval(timer);ws?.close();proc.kill()}





