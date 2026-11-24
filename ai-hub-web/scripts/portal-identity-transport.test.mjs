import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createIdentityConnector} from '../server/src/lib/portalIdentityTransport.ts';
test('a stalled first TLS address falls back before HTTP sees any socket, with original hostname verification',async()=>{
 const sockets=[],options=[];let callbacks=0;
 const connect=createIdentityConnector({attemptMs:10,totalMs:100,lookup:async()=>[{address:'192.0.2.1',family:4},{address:'192.0.2.2',family:4}],connect:opts=>{
  options.push(opts);const socket=Object.assign(new EventEmitter(),{authorized:true,destroyed:false,destroy(){this.destroyed=true}});sockets.push(socket);
  if(sockets.length===2)setTimeout(()=>socket.emit('secureConnect'),1);return socket;
 }});
 const socket=await new Promise((resolve,reject)=>connect({host:'identity.example',port:443},(error,socket)=>{callbacks++;error?reject(error):resolve(socket)}));
 assert.equal(socket,sockets[1]);assert.equal(callbacks,1);assert.equal(sockets[0].destroyed,true);
 for(const option of options){assert.equal(option.servername,'identity.example');assert.equal(option.rejectUnauthorized,true)}
 sockets[0].emit('secureConnect');assert.equal(callbacks,1);
});
test('bad certificates and unavailable addresses never release a socket to HTTP',async()=>{
 let callbacks=0;
 const connector=createIdentityConnector({attemptMs:5,totalMs:50,lookup:async()=>[{address:'192.0.2.3',family:4}],connect:()=>{
  const socket=Object.assign(new EventEmitter(),{authorized:false,destroy(){}});setTimeout(()=>socket.emit('secureConnect'),1);return socket;
 }});
 await new Promise(resolve=>connector({host:'another.example',port:443},(error,socket)=>{callbacks++;assert.ok(error);assert.equal(socket,undefined);resolve()}));assert.equal(callbacks,1);
});
test('DNS stalls have an overall deadline without starting HTTP',async()=>{
 const connector=createIdentityConnector({totalMs:10,lookup:()=>new Promise(()=>{}),connect:()=>{throw Error('must not connect')}});
 await new Promise(resolve=>connector({host:'identity.example'},(error,socket)=>{assert.ok(error);assert.equal(socket,undefined);resolve()}));
});
