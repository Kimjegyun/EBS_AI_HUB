import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const browser = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'acap-entry-'))
const child = spawn(browser, ['--headless=new','--disable-gpu','--no-first-run','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'], {windowsHide:true,stdio:'ignore'})
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms))
let socket
try {
  const portFile=path.join(profile,'DevToolsActivePort')
  for(let i=0;!fs.existsSync(portFile)&&i<100;i++)await pause(100)
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0].trim()
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json()
  socket=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl)
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
  let sequence=0;const pending=new Map(),errors=[],failures=[]
  socket.onmessage=event=>{
    const message=JSON.parse(event.data)
    if(message.id){const item=pending.get(message.id);if(!item)return;pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error(message.error.message)):item.resolve(message.result)}
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text)
    if(message.method==='Log.entryAdded'&&message.params.entry.level==='error')errors.push(message.params.entry.text)
    if(message.method==='Network.responseReceived'&&message.params.response.status>=400){const r=message.params.response;failures.push({url:r.url.split('?')[0],status:r.status})}
    if(message.method==='Network.loadingFailed')failures.push({error:message.params.errorText,blocked:message.params.blockedReason})
  }
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(Error(method+' timed out')),20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}))})
  await Promise.all([send('Page.enable'),send('Network.enable'),send('Runtime.enable'),send('Log.enable')])
  await send('Page.navigate',{url:'https://ebs-aihub.com/ACAP'})
  await pause(10000)
  const result=await send('Runtime.evaluate',{expression:'JSON.stringify({url:location.origin+location.pathname,title:document.title,body:document.body.innerText.slice(0,1800)})',returnByValue:true})
  console.log(JSON.stringify({page:JSON.parse(result.result.value),errors,failures},null,2))
} finally {socket?.close();child.kill()}
