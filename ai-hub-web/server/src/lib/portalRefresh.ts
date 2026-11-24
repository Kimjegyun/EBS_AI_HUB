type Result={status:number;body:Record<string,unknown>}
const failure=(status:number,code:string):Result=>({status,body:{code,msg:code==='refresh_token_not_found'?'Refresh token is invalid.':'Session refresh is temporarily unavailable.'}})
/** Refresh only against the configured identity provider. Never accept a URL, key,
 * grant type, user ID or permission decision supplied by the client. */
export async function refreshPortalSession(base:string,key:string,input:unknown,request:typeof fetch=fetch,timeoutMs=8000):Promise<Result>{
  if(!input||typeof input!=='object'||Array.isArray(input))return failure(400,'invalid_request')
  const token=(input as Record<string,unknown>).refresh_token
  if(typeof token!=='string'||!token||token.length>8192||/\s/.test(token)||Object.keys(input).some(name=>name!=='refresh_token'))return failure(400,'invalid_request')
  const signal=AbortSignal.timeout(timeoutMs)
  let abort:(()=>void)|undefined
  try{
    const url=new URL(base)
    if(url.protocol!=='https:'||!key||url.username||url.password)return failure(503,'auth_unavailable')
    const work=async():Promise<Result>=>{
      const response=await request(new URL('/auth/v1/token?grant_type=refresh_token',url),{
        method:'POST',headers:{apikey:key,'Content-Type':'application/json','X-Supabase-Api-Version':'2024-01-01'},body:JSON.stringify({refresh_token:token}),redirect:'error',signal,
      })
      if(!response.ok){
        const status=response.status
        const body=await response.json().catch(()=>null) as {error_code?:string;code?:string}|null
        // An upstream gateway/WAF can return 403 too. Only a definitive refresh
        // credential rejection may end the SDK session; outages remain retryable.
        const invalid=['refresh_token_not_found','refresh_token_already_used','session_not_found','validation_failed'].includes(body?.error_code||body?.code||'')
        return [400,401,403].includes(status)&&invalid?failure(400,'refresh_token_not_found'):failure(503,'auth_unavailable')
      }
      const body=await response.json() as Record<string,unknown>
      if(!body||typeof body.access_token!=='string'||!body.access_token||typeof body.refresh_token!=='string'||!body.refresh_token
        ||typeof body.expires_in!=='number'||!Number.isFinite(body.expires_in)||body.expires_in<=0||body.token_type!=='bearer'
        ||!body.user||typeof body.user!=='object'||typeof (body.user as Record<string,unknown>).id!=='string')return failure(503,'auth_unavailable')
      return {status:200,body:{access_token:body.access_token,refresh_token:body.refresh_token,expires_in:body.expires_in,
        token_type:body.token_type,user:body.user,...(typeof body.expires_at==='number'?{expires_at:body.expires_at}:{})}}
    }
    return await Promise.race([work(),new Promise<Result>(resolve=>{abort=()=>resolve(failure(503,'auth_unavailable'));signal.addEventListener('abort',abort,{once:true})})])
  }catch{return failure(503,'auth_unavailable')}
  finally{if(abort)signal.removeEventListener('abort',abort)}
}
