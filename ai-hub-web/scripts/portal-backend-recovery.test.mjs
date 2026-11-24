import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ensurePortalBackends} from './ensure-portal-backends.mjs';
test('registered apps recover independently and legacy modules remain compatible',async()=>{
 let calls=0;
 const result=await ensurePortalBackends(['/app-a.mjs','/legacy.mjs','/app-b.mjs'],{load:async url=>url.includes('legacy')?{}:{ensurePortalBackend:async()=>{calls++;return {ready:true};}}});
 assert.equal(calls,2);assert.deepEqual(result,{checked:2,ready:true});
});
test('one failed app does not suppress recovery of other apps',async()=>{
 let calls=0;
 await assert.rejects(ensurePortalBackends(['/first.mjs','/second.mjs'],{load:async()=>({ensurePortalBackend:async()=>{if(++calls===1)throw Error('private details');return {ready:true};}})}),/could not be recovered/);
 assert.equal(calls,2);
});
