import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'.runtime','portal-login-browser-'+Date.now());
fs.mkdirSync(output,{recursive:true});
const origin=process.env.PORTAL_TEST_ORIGIN||'http://127.0.0.1:3002';
const browser=[path.join(process.env.ProgramFiles||'C:/Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe')].find(fs.existsSync);
if(!browser)throw Error('Chrome or Edge is required for portal login browser regression.');
const profile=path.join(output,'profile');
const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket;
try{
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let attempt=0;!fs.existsSync(portFile)&&attempt<150;attempt++)await pause(100);
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0].trim();
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();
  socket=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let sequence=0;const pending=new Map(),documents=[];
  socket.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Network.requestWillBeSent'&&message.params.type==='Document')documents.push(new URL(message.params.request.url).pathname);
    if(message.id){const item=pending.get(message.id);if(!item)return;pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error(message.error.message)):item.resolve(message.result);}
  };
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result.value;};
  await send('Page.enable');await send('Network.enable');
  await send('Network.setBlockedURLs',{urls:['*auth.fixture.invalid*','*fonts.googleapis.com*','*fonts.gstatic.com*']});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    if(location.origin===${JSON.stringify(origin)}){
      const portal=location.pathname.split('/')[1];
      if(['admin','user'].includes(portal)){
        localStorage.clear();sessionStorage.clear();
        localStorage.setItem('ai-hub:'+portal+':ai-hub-auth',JSON.stringify({userId:'portal-browser-fixture',role:portal,status:'approved',email:'fixture@example.invalid',displayName:'Browser fixture'}));
        localStorage.setItem('ai-hub:'+portal+':ai-hub-runtime-supabase-config-v1',JSON.stringify({url:'https://auth.fixture.invalid',anonKey:'public-test-key'}));
        const nativeFetch=window.fetch.bind(window);
        window.fetch=(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input),location.href);return url.origin===location.origin&&url.pathname.startsWith('/api/')?Promise.resolve(new Response(JSON.stringify({error:'Synthetic browser fixture: production APIs disabled'}),{status:503,headers:{'Content-Type':'application/json'}})):nativeFetch(input,init);};
        if(location.pathname.endsWith('/login'))history.replaceState({usr:{from:new URLSearchParams(location.search).get('fixtureFrom')||'/dashboard'},key:'fixture'},'',location.href);
      }
    }
  `});
  const results=[];
  for(const portal of ['admin','user']){
    for(const page of ['/dashboard','/settings']){
      const start=documents.length;
      await send('Page.navigate',{url:origin+'/'+portal+'/login?fixtureFrom='+encodeURIComponent(page)});
      // A new user with no installed apps is sent from dashboard to the marketplace.
      const expected=portal==='user'&&page==='/dashboard'?'/user/marketplace':'/'+portal+page;
      let result;
      for(let attempt=0;attempt<100;attempt++){
        await pause(100);
        try{result=await evaluate('({path:location.pathname,text:document.body.innerText,root:!!document.querySelector("#root")?.children.length})');}catch{continue;}
        if(result.path===expected&&result.root&&!result.text.includes('Not published'))break;
      }
      assert.equal(result?.path,expected);
      assert.ok(result.root);
      assert.ok(!documents.slice(start).some(item=>item===page),'Internal portal navigation escaped its basename');
      await send('Page.reload',{ignoreCache:true});
      await pause(500);
      assert.equal(await evaluate('location.pathname'),expected,'Saved portal route reload escaped its basename');
      results.push({portal,page,reload:true});
    }
  }
  // An app can reject its session and return to the portal while the portal's
  // cached display session remains. Never send that stale session straight back.
  {
    const start=documents.length;
    await send('Page.navigate',{url:origin+'/user/login?fixtureFrom='+encodeURIComponent('/ACAP/')});
    let state;
    for(let attempt=0;attempt<150;attempt++){
      await pause(100);
      try{state=await evaluate('({path:location.pathname,text:document.body.innerText})');}catch{continue;}
      if(state.text.includes('Google 또는 아이디로 다시 로그인'))break;
    }
    assert.equal(state?.path,'/user/login','A cached portal session must not bounce back into the external app');
    assert.ok(state.text.includes('Google 또는 아이디로 다시 로그인'),'Missing Supabase session must show a recovery message');
    assert.ok(!documents.slice(start).some(item=>item.startsWith('/ACAP')),'Stale display session caused an external redirect');
    results.push({externalApp:'/ACAP/',staleSessionRedirectBlocked:true});
  }
  const result={ok:true,syntheticSession:true,productionApiCalls:false,cases:results};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));
  console.log('PASS portal login browser:',JSON.stringify(result));
}finally{socket?.close();child.kill();}
