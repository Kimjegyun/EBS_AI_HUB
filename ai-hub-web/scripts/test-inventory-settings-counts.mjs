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
await send('Page.enable');
await send('Page.navigate',{url:'https://localhost:5173/'});await pause(1500);
console.log(await evaluate(`(async()=>{
  const RefreshRuntime=(await import('/@react-refresh')).default;
  RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
  const original=window.fetch;window.deleted=[];window.confirmedAssets=6;
  let rows=[{id:'unused',title:'Unused',parentDept:'HQ',assetCount:10,sessionCount:0,source:'old',uploadedAt:'2026-09-22'}, {id:'used',title:'Used',parentDept:'HQ',assetCount:20,sessionCount:1,source:'old',uploadedAt:'2026-09-22'}];
  rows[1].sessionCount=2;
  window.fetch=async(input,init={})=>{const url=String(input);if(url.includes('/api/')){if(url.endsWith('/events'))return new Response('',{status:503});if(url.endsWith('/stats/coverage'))return Response.json({datasets:[{datasetId:'unused',confirmed:0},{datasetId:'used',confirmed:confirmedAssets}]});if(init.method==='DELETE'){const id=url.split('/').pop();deleted.push(id);rows=rows.filter(r=>r.id!==id);return Response.json({ok:true})}if(url.endsWith('/datasets'))return Response.json(rows);if(url.endsWith('/survey-form'))return Response.json(null);return Response.json([])}if(url.endsWith('/health'))return Response.json({ok:true});return original(input,init)};
  const React=(await import('/node_modules/.vite/deps/react.js')).default;
  const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const {default:Panel}=await import('/src/apps/inventory/InventorySettingsPanel.tsx');
  document.body.innerHTML='<div id="test-root"></div>';createRoot(document.getElementById('test-root')).render(React.createElement(Panel));
  for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,50));if(document.querySelectorAll('tbody tr').length===2)break;}
  const assert=(v,m)=>{if(!v)throw Error(m)};
  assert(document.querySelectorAll('tbody tr').length===2,'DB list missing');
  const cells=document.querySelectorAll('tbody tr')[1].querySelectorAll('td');
  assert(cells[4].textContent==='6\uac74','Confirmed asset count must be six');
  assert(cells[5].textContent==='2\uac1c','Survey workspace count must be two');
  window.confirmedAssets=7;window.dispatchEvent(new Event('focus'));
  for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,50));if(document.querySelectorAll('tbody tr')[1].querySelectorAll('td')[4].textContent==='7\uac74')break;}
  assert(document.querySelectorAll('tbody tr')[1].querySelectorAll('td')[4].textContent==='7\uac74','Refresh did not update asset count');
  assert(document.querySelectorAll('tbody tr')[1].querySelector('button').disabled,'Linked DB not protected');
  window.confirm=()=>false;document.querySelector('tbody tr button').click();await new Promise(r=>setTimeout(r,100));assert(deleted.length===0,'Cancel deleted data');
  window.confirm=()=>true;document.querySelector('tbody tr button').click();
  for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,50));if(document.querySelectorAll('tbody tr').length===1)break;}
  assert(deleted.join()==='unused','Wrong DB deleted');assert(document.querySelectorAll('tbody tr').length===1,'List not refreshed');
  return 'PASS DB list, linked DB protection, confirmation cancel, selected DB deletion and refreshed counts';
})()`));
await send('Browser.close');
}finally{clearInterval(timer);ws?.close();proc.kill()}
