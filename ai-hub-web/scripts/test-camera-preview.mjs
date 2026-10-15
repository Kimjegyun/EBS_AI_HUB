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

const QRCode=(await import('qrcode')).default;
const code=await QRCode.toDataURL('AB123456789',{width:160,margin:2});
for (const [width,height] of [[360,640],[640,360],[800,300]]) {
await evaluate('(async()=>{'+
 'window.sourceCanvas=document.createElement("canvas");sourceCanvas.width='+width+';sourceCanvas.height='+height+';'+
 'window.sourceContext=sourceCanvas.getContext("2d");sourceContext.fillStyle="white";sourceContext.fillRect(0,0,'+width+','+height+');'+
 'window.scanResults=[];window.lastDecode=null;'+
 'window.originalDrawImage ??= CanvasRenderingContext2D.prototype.drawImage;'+
 'CanvasRenderingContext2D.prototype.drawImage=function(...args){if(args[0] instanceof HTMLVideoElement)window.lastDecode=args.slice(1);return window.originalDrawImage.apply(this,args)};'+
 'navigator.mediaDevices.getUserMedia=async()=>{const stream=sourceCanvas.captureStream(10);window.frameTimer=setInterval(()=>sourceContext.fillRect(0,0,1,1),100);return stream};'+
 'const React=(await import("/node_modules/.vite/deps/react.js")).default;'+
 'const {createRoot}=(await import("/node_modules/.vite/deps/react-dom_client.js")).default;'+
 'const {default:Scanner}=await import("/src/apps/inventory/QrScanner.tsx");'+
 'const div=document.createElement("div");document.body.append(div);window.scannerTestRoot=createRoot(div);'+
 'scannerTestRoot.render(React.createElement(Scanner,{onResult:text=>scanResults.push(text),onClose:()=>{}}));'+
 '})()');
await pause(1600);
const geometry=await evaluate('(()=>{const v=document.querySelector("[id^=qr-reader-] video");const viewport=v.parentElement.parentElement.getBoundingClientRect();const video=v.getBoundingClientRect();return {viewport:{x:viewport.x,y:viewport.y,w:viewport.width,h:viewport.height},video:{x:video.x,y:video.y,w:video.width,h:video.height},draw:window.lastDecode}})()');
const p=geometry.viewport,v=geometry.video;
if(Math.abs(v.x-p.x)>1||Math.abs(v.w-p.w)>1||v.y>p.y+1||v.y+v.h<p.y+p.h-1)throw new Error('Preview does not fill viewport: '+JSON.stringify(geometry));
if(Math.abs(v.w/v.h-width/height)>.01)throw new Error('Video stretched');
if(!geometry.draw)throw new Error('Decoder inactive');
const [sx,sy,sw,sh]=geometry.draw;
const expectedY=(p.y-v.y)/v.h*height, expectedHeight=p.h/v.h*height;
if(Math.abs(sx)>1||Math.abs(sw-width)>1||Math.abs(sy-expectedY)>2||Math.abs(sh-expectedHeight)>2)throw new Error('Decoded area differs from visible area: '+JSON.stringify(geometry));
console.log('PASS '+width+'x'+height+': no side bars; no stretching; visible and decoded crop match');
await evaluate('(async()=>{const img=new Image();img.src='+JSON.stringify(code)+';await img.decode();sourceContext.drawImage(img,(sourceCanvas.width-160)/2,(sourceCanvas.height-160)/2,160,160)})()');
let detected=false;
for(let i=0;i<50;i++){if(await evaluate('scanResults.includes("AB123456789")')){detected=true;break;}await pause(100);}
if(!detected)throw new Error('Visible QR failed to decode for '+width+'x'+height);
console.log('PASS QR decoded from '+width+'x'+height+' camera');
await evaluate('scannerTestRoot.unmount();clearInterval(frameTimer)');await pause(300);
}
await send('Browser.close');
}finally{clearInterval(timer);ws?.close();proc.kill()}
