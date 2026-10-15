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
 const source=await(await fetch('/src/lib/appPublicationService.ts')).text();const sbUrl=source.match(/from ["']([^"']*supabase[^"']*)["']/)[1];const {supabase}=await import(sbUrl);
 supabase.rpc=async()=>({data:null,error:{message:'Unavailable'}});
 const publication=await import('/src/lib/appPublicationService.ts');localStorage.removeItem('ai-hub-org-published-apps-v1');localStorage.setItem('auth_token','regression-only-token');
 let requestedAuth=false,failed=false;const original=window.fetch;
 window.fetch=async(url,init)=>{if(String(url).includes('/api/apps/published')){requestedAuth=!!new Headers(init?.headers).get('Authorization');return failed?new Response('',{status:503}):requestedAuth?Response.json({appIds:['calendar','inventory']}):new Response('',{status:401})}return original(url,init)};
 const apps=await publication.fetchPublishedApps();if(!requestedAuth||apps.length!==2)throw Error('New user list failed');
 localStorage.removeItem('ai-hub-org-published-apps-v1');failed=true;let shown=false;try{await publication.fetchPublishedApps()}catch{shown=true}if(!shown)throw Error('Failure hidden as empty catalog');
 return 'PASS fresh user sends authentication and receives registered apps; errors are not hidden as empty lists';
})()`);console.log(result);
await send('Browser.close');
}finally{clearInterval(timer);ws?.close();proc.kill()}
