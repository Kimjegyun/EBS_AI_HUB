import {test} from 'node:test';
import assert from 'node:assert/strict';
import {refreshPortalSession} from '../server/src/lib/portalRefresh.ts';
const payload={refresh_token:'synthetic-refresh'};
const session={access_token:'synthetic-access',refresh_token:'synthetic-next',expires_in:3600,token_type:'bearer',user:{id:'fixture-user'}};
test('refresh forwards only the supplied session token to the configured provider, without membership approval or server secrets',async()=>{
 let calls=0;
 const result=await refreshPortalSession('https://identity.invalid','server-anon',payload,async(url,init)=>{
  calls++;assert.equal(String(url),'https://identity.invalid/auth/v1/token?grant_type=refresh_token');assert.equal(init.redirect,'error');
  assert.deepEqual(JSON.parse(init.body),payload);assert.equal(new Headers(init.headers).get('apikey'),'server-anon');assert.equal(new Headers(init.headers).get('X-Supabase-Api-Version'),'2024-01-01');
  return Response.json({...session,provider_token:'do-not-forward',unexpectedSecret:'do-not-forward'});
 });assert.equal(calls,1);assert.deepEqual(result,{status:200,body:session});
});
test('invalid input and unconfigured destination never make outbound requests',async()=>{
 let calls=0;const request=async()=>{calls++;return Response.json(session)};
 for(const input of [null,[],{}, {refresh_token:1},{refresh_token:'x',url:'https://attacker.invalid'},{refresh_token:'x',grant_type:'password'},{refresh_token:'x y'},{refresh_token:'x'.repeat(8193)}])assert.equal((await refreshPortalSession('https://identity.invalid','key',input,request)).status,400);
 for(const url of ['http://identity.invalid','https://user:pass@identity.invalid','invalid'])assert.equal((await refreshPortalSession(url,'key',payload,request)).status,503);
 assert.equal(calls,0);
});
test('only known invalid refresh credentials end a session; WAF, rates, malformed and unavailable services remain transient',async()=>{
 for(const status of [400,401,403,404,429,500,502,503,504]){
  assert.equal((await refreshPortalSession('https://identity.invalid','key',payload,async()=>Response.json({message:'unavailable'},{status}))).status,503);
 }
 for(const code of ['refresh_token_not_found','refresh_token_already_used','session_not_found','validation_failed'])assert.equal((await refreshPortalSession('https://identity.invalid','key',payload,async()=>Response.json({code},{status:400}))).status,400);
 for(const body of [null,{}, {...session,access_token:null}])assert.equal((await refreshPortalSession('https://identity.invalid','key',payload,async()=>Response.json(body))).status,503);
});
test('headers and body stalls are bounded and no refresh mutation is retried by the relay',async()=>{
 for(const phase of ['headers','body']){
  let calls=0;
  const result=await refreshPortalSession('https://identity.invalid','key',payload,async()=>{calls++;return phase==='headers'?new Promise(()=>{}):new Response(new ReadableStream())},20);
  assert.equal(result.status,503);assert.equal(calls,1);
 }
});
