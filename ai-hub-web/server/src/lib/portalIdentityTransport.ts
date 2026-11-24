import {lookup} from 'node:dns/promises'
import {Agent,request as httpsRequest} from 'node:https'
import {connect as tlsConnect,type ConnectionOptions,type TLSSocket} from 'node:tls'

type Address={address:string;family:number}
type Dependencies={lookup:(host:string)=>Promise<Address[]>;connect:(options:ConnectionOptions)=>TLSSocket;attemptMs?:number;totalMs?:number}
/** Complete verified TLS BEFORE handing a socket to HTTP. Switching a stalled DNS
 * address can therefore never submit a refresh token or RPC more than once. */
export function createIdentityConnector(deps:Dependencies={lookup:host=>lookup(host,{all:true}),connect:tlsConnect}){
 return (options:ConnectionOptions&{host?:string},done:(error:Error|null,socket?:TLSSocket)=>void)=>{
  const hostname=String(options.servername||options.host||'')
  let finished=false,current:TLSSocket|undefined,attempt:ReturnType<typeof setTimeout>|undefined
  const finish=(error:Error|null,socket?:TLSSocket)=>{if(finished)return;finished=true;clearTimeout(total);clearTimeout(attempt);if(error)current?.destroy();done(error,socket)}
  const total=setTimeout(()=>finish(Error('Identity TLS connection timed out')),deps.totalMs||6500)
  void deps.lookup(hostname).then(rows=>{
   const addresses=rows.slice(0,4);let index=0
   const next=()=>{
    if(finished)return
    const row=addresses[index++];if(!row){finish(Error('Identity TLS addresses unavailable'));return}
    let settled=false
    const failed=()=>{if(settled||finished)return;settled=true;clearTimeout(attempt);current?.destroy();next()}
    try{
     const socket=deps.connect({...options,host:row.address,servername:hostname,rejectUnauthorized:true});current=socket
     socket.once('error',failed)
     socket.once('secureConnect',()=>{if(settled||finished)return;if(!socket.authorized){failed();return}settled=true;finish(null,socket)})
     attempt=setTimeout(failed,deps.attemptMs||1500)
    }catch{failed()}
   };next()
  }).catch(()=>finish(Error('Identity DNS lookup failed')))
 }
}
const agent=new Agent({keepAlive:true,maxSockets:20,maxFreeSockets:4,timeout:30000})
Object.assign(agent,{createConnection:createIdentityConnector()})

/** Small fixed-provider identity JSON transport. No redirects or HTTP retries. */
export const portalIdentityFetch:typeof fetch=async(input,init)=>{
 const outgoing=new Request(input,init),url=new URL(outgoing.url)
 if(url.protocol!=='https:')throw Error('HTTPS identity endpoint required')
 outgoing.signal.throwIfAborted()
 const bytes=outgoing.body?Buffer.from(await outgoing.arrayBuffer()):undefined
 return new Promise<Response>((resolve,reject)=>{
  const request=httpsRequest(url,{agent,method:outgoing.method,headers:Object.fromEntries(outgoing.headers),signal:outgoing.signal},response=>{
   const chunks:Buffer[]=[];let size=0
   response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1024*1024){request.destroy(Error('Identity response too large'));return}chunks.push(chunk)})
   response.on('error',reject)
   response.on('end',()=>{
    try{
     const status=response.statusCode||503,headers=new Headers()
     for(const [key,value] of Object.entries(response.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value)
     resolve(new Response([204,205,304].includes(status)?null:Buffer.concat(chunks),{status,headers}))
    }catch(error){reject(error)}
   })
  })
  request.on('error',reject);request.end(bytes)
 })
}
