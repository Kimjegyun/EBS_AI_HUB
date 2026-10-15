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
const source=await (await fetch('/src/apps/inventory/GalleryPhotos.tsx')).text();const reactUrl=source.match(/from ["']([^"']*react.js[^"']*)["']/)[1];const React=(await import(reactUrl)).default;
const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
if(!window.__vite_plugin_react_preamble_installed__){const refresh=(await import('/@react-refresh')).default;refresh.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;}
const {default:Gallery}=await import('/src/apps/inventory/GalleryPhotos.tsx');
const {getPhotos,deletePhotos}=await import('/src/apps/inventory/photoService.ts');
let selected=[];
function Test(){const [ids,setIds]=React.useState([]);selected=ids;return React.createElement(Gallery,{ids,onAdd:added=>setIds(old=>[...old,...added]),onRemove:id=>setIds(old=>old.filter(x=>x!==id)),onBusy:()=>{}})}
const div=document.createElement('div');document.body.append(div);const root=createRoot(div);root.render(React.createElement(Test));await new Promise(r=>setTimeout(r,700));
const canvas=document.createElement('canvas');canvas.width=2000;canvas.height=1000;canvas.getContext('2d').fillRect(0,0,2000,1000);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
const transfer=new DataTransfer();transfer.items.add(new File([blob],'one.png',{type:'image/png'}));transfer.items.add(new File([blob],'two.png',{type:'image/png'}));transfer.items.add(new File(['broken'],'broken.jpg',{type:'image/jpeg'}));
const input=div.querySelector('input');if(!input.multiple||input.hasAttribute('capture'))throw Error('Gallery picker incorrect');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,100));if(div.querySelectorAll('img').length===2&&div.querySelector('[role=alert]'))break}
if(selected.length!==2||div.querySelectorAll('img').length!==2||!div.querySelector('[role=alert]'))throw Error('Mixed image batch failed');
const saved=await getPhotos(selected);const bitmap=await createImageBitmap(await (await fetch(saved[0].dataUrl)).blob());if(bitmap.width!==1280||bitmap.height!==640)throw Error('Resize failed');bitmap.close();
const {submitSurveyResults}=await import('/src/apps/inventory/inventoryApiClient.ts');const realFetch=window.fetch;let uploads=0,submitted;
window.fetch=async(input,init)=>{const url=String(input);if(url.includes('/photo')){uploads++;return new Response(JSON.stringify({id:'new-server-photo'}),{status:200})}if(url.includes('/submit')){submitted=JSON.parse(init.body);return new Response(JSON.stringify({ok:true,acknowledged:[],conflicts:[]}),{status:200})}return realFetch(input,init)};
try{const response=await submitSurveyResults('test',[{assetNo:'test',confirmed:true,photoIds:selected,photoKeys:[selected[0]],serverPhotoIds:['previous-server-photo']}]);if(!response.ok||uploads!==1||submitted.results[0].serverPhotoIds.length!==2)throw Error('Incremental upload failed')}finally{window.fetch=realFetch}
const all=[...selected];div.querySelector('button').click();await new Promise(r=>setTimeout(r,100));if(selected.length!==1)throw Error('Detach failed');root.unmount();await deletePhotos(all);div.remove();
return 'PASS multiple gallery images, partial failure, thumbnails, resize, detach, incremental server upload';
})()`);console.log(result);
await send('Browser.close');
}finally{clearInterval(timer);ws?.close();proc.kill()}
