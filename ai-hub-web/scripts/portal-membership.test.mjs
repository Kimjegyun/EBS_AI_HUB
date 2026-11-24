import test from 'node:test';import assert from 'node:assert/strict';
import {verifyPortalMembership} from '../server/src/lib/portalMembership.ts';
test('portal verification keeps transient outages separate from credentials and current account approval',async()=>{
 for(const user of ['first-member','other-restored-member'])for(const scenario of ['approved','user-401','user-403','user-429','user-503','network','rpc-401','rpc-503','pending','revoked','mismatch']){
  let calls=0;
  const result=await verifyPortalMembership('https://auth.fixture.invalid','public-test-key','secret-test-session',async(url,init)=>{
   calls++;assert.equal(init.redirect,'error');assert.ok(init.signal);
   if(scenario==='network')throw TypeError('network');
   const status=String(url).includes('/auth/')?Number(scenario.match(/^user-(\d+)$/)?.[1]||200):Number(scenario.match(/^rpc-(\d+)$/)?.[1]||200);
   return Response.json(String(url).includes('/auth/')?{id:user}:{user_id:scenario==='mismatch'?'different-member':user,status:['pending','revoked'].includes(scenario)?scenario:'approved',role:'user'},{status});
  });
  const expected=scenario==='approved'?200:['user-401','user-403','rpc-401'].includes(scenario)?401:['pending','revoked','mismatch'].includes(scenario)?403:503;
  assert.equal(result.status,expected,scenario);assert.equal(result.body.approved,expected===200);assert.ok(!JSON.stringify(result).includes('secret-test-session'));
  if(expected===200)assert.equal(result.body.userId,user);
  assert.ok(calls<=2);
 }
});
