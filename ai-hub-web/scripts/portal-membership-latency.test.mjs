import test from 'node:test';import assert from 'node:assert/strict';
import {verifyPortalMembership} from '../server/src/lib/portalMembership.ts';

test('identity and membership reads start together, but neither alone grants access',async()=>{
 const waiting=[];let completed=false;
 const work=verifyPortalMembership('https://auth.fixture.invalid','public','session',async(url,init)=>new Promise(resolve=>{
  assert.equal(init.redirect,'error');assert.ok(init.signal);
  waiting.push(()=>resolve(Response.json(String(url).includes('/auth/')?{id:'member'}:{user_id:'member',status:'approved',role:'user'})));
 })).then(result=>{completed=true;return result});
 assert.equal(waiting.length,2,'independent reads must run concurrently');waiting[0]();await Promise.resolve();assert.equal(completed,false);
 waiting[1]();assert.equal((await work).status,200);
});

test('simultaneous identical sessions share checks, while revocation is rechecked immediately after completion',async()=>{
 let calls=0,status='approved';const releases=[];
 const request=async url=>{calls++;if(status==='approved')await new Promise(resolve=>releases.push(resolve));return Response.json(String(url).includes('/auth/')?{id:'member'}:{user_id:'member',status,role:'user'});};
 const args=['https://auth.fixture.invalid','public','private-test-token',request];
 const first=verifyPortalMembership(...args),second=verifyPortalMembership(...args),third=verifyPortalMembership(...args);
 assert.equal(calls,2);releases.forEach(done=>done());assert.ok((await Promise.all([first,second,third])).every(result=>result.status===200));
 status='revoked';assert.equal((await verifyPortalMembership(...args)).status,403);assert.equal(calls,4,'completed decisions must never be cached');
});

test('different accounts and authentication configurations cannot share approval',async()=>{
 let calls=0;const releases=[];
 const request=async(url,init)=>{calls++;await new Promise(resolve=>releases.push(resolve));const user=init.headers.Authorization;return Response.json(String(url).includes('/auth/')?{id:user}:{user_id:user,status:'approved'});};
 const pending=[['https://one.invalid','key','first'],['https://one.invalid','key','second'],['https://two.invalid','key','first'],['https://one.invalid','new-key','first']].map(args=>verifyPortalMembership(...args,request));
 assert.equal(calls,8);releases.forEach(done=>done());assert.ok((await Promise.all(pending)).every(result=>result.status===200));
});

test('denied identity returns without waiting for membership and cancels the unused read',async()=>{
 let cancelled=false;
 const result=await verifyPortalMembership('https://auth.fixture.invalid','public','session',async(url,init)=>{
  if(String(url).includes('/auth/'))return new Response('',{status:401});
  return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>{cancelled=true;reject(init.signal.reason);},{once:true}));
 });assert.equal(result.status,401);assert.equal(cancelled,true);
});

test('network failure, wrong identity and malformed data never become approval',async()=>{
 for(const scenario of ['network','mismatch','bad-user','bad-member']){
  const result=await verifyPortalMembership('https://auth.fixture.invalid','public','session',async url=>{
   if(scenario==='network')throw TypeError('Failed to fetch');
   return Response.json(String(url).includes('/auth/')?(scenario==='bad-user'?{}:{id:'member'}):(scenario==='bad-member'?{}:{user_id:scenario==='mismatch'?'other':'member',status:'approved'}));
  });assert.equal(result.body.approved,false);
 }
});
