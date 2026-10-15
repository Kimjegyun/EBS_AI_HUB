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
for(const scenario of [{status:'pending'}, {status:'approved'}, {status:'approved', late:true}, {status:'approved', stale:true}]){
const {status,late=false,stale=false}=scenario;
const result=await evaluate(`(async()=>{
 const React=(await import('/node_modules/.vite/deps/react.js')).default;
 const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
 const transformed=await (await fetch('/src/pages/GoogleSignupPage.tsx')).text();
 const routerUrl=transformed.match(/from ["']([^"']*react-router-dom[^"']*)["']/)[1];
 const {MemoryRouter,Routes,Route}=await import(routerUrl);
 const {supabase}=await import(transformed.match(/from ["']([^"']*lib[/]supabase[^"']*)["']/)[1]);
 const {AuthProvider}=await import(transformed.match(/from ["']([^"']*AuthContext[^"']*)["']/)[1]);
 const {default:Page}=await import('/src/pages/GoogleSignupPage.tsx');
 const {setPortalScopedSessionItem,getPortalScopedSessionItem}=await import('/src/lib/portalStorage.ts');
 const {getDistributedOrgs}=await import('/src/apps/inventory/datasetService.ts');
 const org=(await getDistributedOrgs()).orgs[0];if(!org)throw Error('No orgs');
 const profile={headquarters:org,department:'Test',name:'Tester',phone:'0200000000'};
 setPortalScopedSessionItem('google-signup-profile',JSON.stringify(profile));
 window.callbackErrors=[];window.addEventListener('error',e=>callbackErrors.push(e.message));window.savedProfiles=[];window.memberships=0;
 const user={id:'test-google',email:'test@example.invalid',user_metadata:{},app_metadata:{provider:'google'}};
 let authenticated=${!late};
 const authListeners=new Set();
 supabase.auth.onAuthStateChange=callback=>{authListeners.add(callback);return {data:{subscription:{unsubscribe:()=>authListeners.delete(callback)}}}};
 supabase.auth.getUser=async()=>({data:{user:authenticated?user:null},error:null});
 supabase.auth.getSession=async()=>({data:{session:${stale} ? {user} : null},error:null});
 supabase.auth.updateUser=async({data})=>{savedProfiles.push(data);return {data:{user},error:null}};
 supabase.auth.signOut=async()=>({error:null});
 supabase.rpc=async(name)=>{if(name!=='ai_hub_ensure_membership_v2'){await new Promise(r=>setTimeout(r,1000));return {data:null,error:null}};memberships++;return {data:{user_id:user.id,email:user.email,role:'user',status:'`+status+`',display_name:profile.name},error:null}};
 const div=document.createElement('div');document.body.append(div);window.callbackRoot=createRoot(div);window.callbackDiv=div;
 callbackRoot.render(React.createElement(React.StrictMode,null,React.createElement(AuthProvider,null,React.createElement(MemoryRouter,{initialEntries:['/signup/google']},React.createElement(Routes,null,React.createElement(Route,{path:'/signup/google',element:React.createElement(Page)}),React.createElement(Route,{path:'/',element:React.createElement('p',{'data-test':'dashboard'},'Dashboard')}))))));
 if(${late})setTimeout(()=>{authenticated=true;for(const callback of authListeners)callback('SIGNED_IN',{user})},400);
 await new Promise(r=>setTimeout(r,1800));
 return {errors:window.callbackErrors,html:div.innerHTML.slice(0,400),saves:savedProfiles.length,memberships,formInputs:div.querySelectorAll('input').length,dashboard:!!div.querySelector('[data-test=dashboard]'),status:!!div.querySelector('[role=status]'),draftCleared:!getPortalScopedSessionItem('google-signup-profile'),authRetained:!!getPortalScopedSessionItem('ai-hub-auth'),fields:savedProfiles[0]&&Object.keys(savedProfiles[0])};
})()`);
if(result.saves!==1||result.memberships!==1||result.formInputs!==0||!result.draftCleared||(status==='approved'?!result.dashboard:!result.status))throw Error('Callback failed '+status+': '+JSON.stringify(result));
if(status==='approved'&&!result.authRetained)throw Error('Approved login was overwritten by stale session refresh');
console.log('PASS '+JSON.stringify(scenario)+': auto-save once, draft cleared, no repeat form, correct destination');
await evaluate('callbackRoot.unmount();callbackDiv.remove()');
}
await send('Browser.close');
}finally{clearInterval(timer);ws?.close();proc.kill()}
