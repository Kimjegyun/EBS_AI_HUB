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






const origin=process.env.TEST_PORTAL_ORIGIN || 'http://127.0.0.1:3002';
const setup=String.raw`
localStorage.clear();sessionStorage.clear();
const realFetch=window.fetch.bind(window);
const scenario=new URL(location.href).searchParams.get('scenario');
const user={id:'11111111-1111-4111-8111-111111111111',email:'test@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'google',providers:['google']},user_metadata:{},created_at:new Date().toISOString()};
let member=['new','error'].includes(scenario)?null:{user_id:user.id,email:user.email,role:scenario.includes('admin')?'admin':'user',status:scenario.startsWith('pending')?'pending':scenario==='rejected'?'rejected':'approved',display_name:'Existing name'};
window.authTest={saves:0,oldMemberships:0,logins:0};
window.fetch=async(input,init)=>{
 const url=String(input instanceof Request?input.url:input);
 const json=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}));
 if(url.includes('/auth/v1/user')) {if(init?.method==='PUT')authTest.saves++;return json(user)}
 if(url.includes('/auth/v1/logout'))return json({});
 if(url.includes('/rest/v1/rpc/ai_hub_google_login')){
  authTest.logins++;
  if(scenario==='error')return json({message:'Test service unavailable'},503);
  if(!member)member={user_id:user.id,email:user.email,role:'user',status:'approved',display_name:'Google user'};
  if(member.role==='user'&&member.status==='pending')member.status='approved';
  return json(member);
 }
 if(url.includes('/rest/v1/rpc/ai_hub_get_session_v2'))return json(member);
 if(url.includes('/rest/v1/rpc/ai_hub_ensure_membership_v2')){authTest.oldMemberships++;return json(null)}
 if(url.includes('/rest/v1/'))return json([]);
 if(url.includes('/api/')||url.includes('.supabase.co/'))return json([]);
 return realFetch(input,init);
};
`;
await send('Page.addScriptToEvaluateOnNewDocument',{source:setup});
const payload=Buffer.from(JSON.stringify({sub:'11111111-1111-4111-8111-111111111111',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
const token='eyJhbGciOiJIUzI1NiJ9.'+payload+'.test';
for(const scenario of ['anonymous','new','pending','approved','rejected','pending-admin','approved-admin','error']) {
 await send('Page.navigate',{url:'about:blank'});await pause(100);
 const hash=scenario==='anonymous'?'':'#'+new URLSearchParams({access_token:token,refresh_token:'synthetic-refresh',expires_in:'3600',token_type:'bearer'});
 await send('Page.navigate',{url:origin+'/user/signup/google?scenario='+scenario+hash});await pause(2500);
 const state=await evaluate('({inputs:document.querySelectorAll("input,select").length,path:location.pathname,alert:!!document.querySelector("[role=alert]"),counts:window.authTest,session:JSON.parse(sessionStorage.getItem("ai-hub:user:ai-hub-auth")||"null")})');
 if(state.counts.saves||state.counts.oldMemberships)throw Error('Unexpected profile/signup write: '+JSON.stringify(state));
 if(['new','pending','approved','approved-admin'].includes(scenario)) {
  if(!state.session||state.path.includes('/signup'))throw Error('Direct login failed: '+scenario+JSON.stringify(state));
  if(state.session.role!==(scenario==='approved-admin'?'admin':'user'))throw Error('Role changed');
 }else{
  if(state.session||state.inputs)throw Error('Unexpected access or form: '+scenario+JSON.stringify(state));
  if(scenario!=='anonymous'&&!state.alert)throw Error('Missing error: '+scenario);
 }
 console.log('PASS '+scenario+': no profile form or signup writes; expected access');
}
await send('Browser.close');
}finally{clearInterval(timer);ws?.close();proc.kill()}
