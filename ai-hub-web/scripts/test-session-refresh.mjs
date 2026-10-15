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

await send('Page.navigate',{url:'https://localhost:5173/inventory.html'});await pause(1500);


const result=await evaluate(`(async()=>{
 const store=await import('/src/apps/inventory/idb.ts');
 const sync=await import('/src/apps/inventory/syncService.ts');
 const make=(count)=>({id:'sync-regression',name:'test',datasetId:'test',parentDept:'test',dept:'test',createdBy:'test',createdAt:'2026-09-21',completed:false,results:Object.fromEntries(Array.from({length:count},(_,i)=>['asset-'+i,{assetNo:'asset-'+i,confirmed:true}]))});
 const original=window.fetch;let remote=make(5);let fail=false;
 window.fetch=async (input,init)=>{const url=String(input);if(url.endsWith('/health'))return new Response('{}');if(url.endsWith('/api/inventory/sessions'))return Response.json([remote]);if(url.endsWith('/api/inventory/sessions/sync-regression'))return fail?new Response('',{status:503}):Response.json(remote);return original(input,init)};
 await store.idbPut(store.STORE_SESSIONS,make(3));
 await sync.pullServerSessions();
 if(Object.keys((await sync.getSession(remote.id)).results).length!==5)throw Error('Existing session stayed stale');
 await store.idbPut(store.STORE_SYNC_QUEUE,{id:'pending',sessionId:remote.id,action:'delete',assetNo:'asset-1',queuedAt:'2026-09-21',retryCount:0});
 remote=make(7);await sync.pullServerSessions();
 if(Object.keys((await sync.getSession(remote.id)).results).length!==5)throw Error('Pending local changes overwritten');
 await store.idbDelete(store.STORE_SYNC_QUEUE,'pending');
 fail=true;await sync.pullServerSessions();
 if(Object.keys((await sync.getSession(remote.id)).results).length!==5)throw Error('Failed read erased local results');
 fail=false;await sync.pullServerSessions();
 if(Object.keys((await sync.getSession(remote.id)).results).length!==7)throw Error('Refresh failed after pending queue cleared');
 return 'PASS existing 3 -> server 5; pending edits protected; failed reads preserved; later refresh succeeds';
})()`);
console.log(result);
await send('Browser.close');
}finally{clearInterval(timer);ws?.close();proc.kill()}
