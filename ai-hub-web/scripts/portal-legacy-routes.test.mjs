import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {legacyPortalLocation} from './portalLegacyRoutes.mjs';
import {isPortalPagePath} from '../src/lib/portalRoutes.mjs';

test('every declared portal route is reserved from external-app redirects',()=>{
  const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
  for(const [,route] of app.matchAll(/<Route\s+path="([^"*]+)"/g)) {
    if(route!=='/')assert.ok(isPortalPagePath(route), 'Unreserved portal route '+route);
  }
  for(const page of ['/another-studio/dashboard','/external-studio/','/dashboard-other','/api/auth/login','/ACAP/'])assert.equal(isPortalPagePath(page),false);
});

test('legacy GET links preserve query and same-host portal; unknown/private/mutating paths stay closed',async()=>{
  const server=http.createServer((req,res)=>{
    const location=legacyPortalLocation(req);
    if(location){res.writeHead(302,{Location:location,'Cache-Control':'no-store'});res.end();return;}
    if(/^\/(admin|user)\//.test(req.url)){res.end('Portal login and membership checks still apply');return;}
    res.writeHead(404);res.end('Not published');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    for(const referer of [undefined,base+'/admin/login',base+'/user/signup/google','https://attacker.example/admin/']){
      const r=await fetch(base+'/dashboard?project=old%20name',{redirect:'manual',headers:referer?{referer}:{}});
      assert.equal(r.status,302);
      const portal=referer===base+'/admin/login'?'admin':'user';
      assert.equal(r.headers.get('location'),'/'+portal+'/dashboard?project=old%20name');
      assert.equal(r.headers.get('cache-control'),'no-store');
      assert.equal((await fetch(base+r.headers.get('location'))).status,200);
    }
    assert.equal((await fetch(base+'/dashboard',{method:'HEAD',redirect:'manual'})).status,302);
    for(const route of ['/dashboard','/settings','/signup/google','/reset-password'])assert.equal((await fetch(base+route,{method:'POST',redirect:'manual'})).status,404);
    for(const route of ['/__local/private','/api/private','/server/.env','/unknown','/ACAP-other'])assert.equal((await fetch(base+route,{redirect:'manual'})).status,404);
    for(const route of ['/dashboard/../private','/dashboard%2F../private','//attacker.example/dashboard','/dashboard\\..\\private'])assert.equal(legacyPortalLocation({url:route,method:'GET',headers:{}}),null);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
