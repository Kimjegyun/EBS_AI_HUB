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
await send('Page.navigate',{url:'https://localhost:5173/'});await pause(1200);
console.log(await evaluate(String.raw`(async()=>{
 const api=await import('/src/apps/inventory/inventoryApiClient.ts');const original=window.fetch;const calls=[];
 window.fetch=async(url,init={})=>{const u=String(url);if(!u.includes('/api/inventory/'))return original(url,init);calls.push({url:u,method:init.method||'GET'});
 if(u.endsWith('/datasets/survey-form'))return Response.json({id:'current',fileName:'master.xlsx'});
 if(u.endsWith('/datasets'))return Response.json([{id:'d1',source:'survey-form:current|sheet:HQ'},{id:'d2',source:'survey-form:older|sheet:HQ'}]);
 if(u.endsWith('/stats/coverage'))return Response.json({datasets:[{datasetId:'d1',totalAssets:12046,confirmed:6},{datasetId:'d2',totalAssets:12046,confirmed:0}]});
 if(u.includes('/submission/current?year=2026'))return Response.json({status:'ready',fileId:'submission-current',applied:7,unmatched:0});
 if(u.endsWith('/files/submission-current/download'))return new Response('mock-workbook',{headers:{'Content-Disposition':"attachment; filename*=UTF-8''published.xlsx"}});
 throw Error('Unexpected route '+u);
 };
 const current=await api.fetchCurrentCoverage();if(current.coverage.length!==1||current.coverage[0].totalAssets!==12046||current.coverage[0].confirmed!==6)throw Error('Old master counted');
 const click=HTMLAnchorElement.prototype.click;let downloads=0;HTMLAnchorElement.prototype.click=function(){downloads++};
 try{const book=await api.downloadPublishedSubmission('2026');if(book.applied!==7||downloads!==1)throw Error('Published download failed');if(calls.some(c=>c.method!=='GET'))throw Error('Download wrote server data')}finally{HTMLAnchorElement.prototype.click=click;window.fetch=original}
 return 'PASS current ERP only: 12046 assets / 6 confirmed; published workbook download uses GET only';
})()`));
await send('Browser.close');
}finally{clearInterval(timer);ws?.close();proc.kill()}
