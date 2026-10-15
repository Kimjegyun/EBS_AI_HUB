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
 const api=await import('/src/apps/inventory/inventoryApiClient.ts');
 const original=window.fetch;const encoder=new TextEncoder();let calls=0,aborted=false;
 window.fetch=async(url,init)=>{if(!String(url).endsWith('/events'))return original(url,init);calls++;
 if(String(url).includes('token='))throw Error('Token leaked in URL');
 if(!init.headers.Authorization)throw Error('Missing authentication');
 init.signal.addEventListener('abort',()=>{aborted=true});
 return new Response(new ReadableStream({start(c){c.enqueue(encoder.encode('event: connected\ndata: {}\n\nevent: submission_up'));c.enqueue(encoder.encode('dated\ndata: {"sessionId":"s1"}\n\n'));}}),{headers:{'Content-Type':'text/event-stream'}})};
 const events=[];const stop=api.openSseStream('*',(type,data)=>events.push({type,data}));
 await new Promise(r=>setTimeout(r,150));stop();window.fetch=original;
 if(events.length!==2||events[1].type!=='submission_updated'||events[1].data.sessionId!=='s1'||!aborted||calls!==1)throw Error('Streaming regression');
 return 'PASS authenticated streaming, fragmented packet decoding, admin update and cancellation';
})()`));
await send('Browser.close');
}finally{clearInterval(timer);ws?.close();proc.kill()}
