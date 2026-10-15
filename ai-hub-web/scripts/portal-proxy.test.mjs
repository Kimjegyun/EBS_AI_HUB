import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { proxyHttp, proxyUpgrade } from './portalProxy.mjs';

test('HTTP upstream failure and client/peer WebSocket resets preserve the gateway', async () => {
  const sockets = new Set();
  const track = server => server.on('connection', socket => {sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  const listen = server => new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin=track(http.createServer((_req,res)=>res.end('origin')));
  let peer;
  origin.on('upgrade',(_req,socket)=>{
    peer=socket;
    socket.on('error',()=>socket.destroy());
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  });
  await listen(origin);
  const port=origin.address().port;
  const gateway=track(http.createServer((req,res)=>req.url==='/health'?res.end('alive'):proxyHttp(req,res,port)));
  gateway.on('upgrade',(req,socket,head)=>proxyUpgrade(req,socket,head,port));
  await listen(gateway);
  const base=`http://127.0.0.1:${gateway.address().port}`;
  const upgrade=()=>new Promise((resolve,reject)=>{
    const client=net.connect(gateway.address().port,'127.0.0.1',()=>client.write('GET /studio/ HTTP/1.1\r\nHost: studio.example.org\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'));
    client.on('error',()=>{});
    client.once('data',data=>{try{assert.match(data.toString(),/101 Switching/);resolve(client);}catch(e){reject(e);}});
    client.setTimeout(3000,()=>{client.destroy();reject(Error('Upgrade timed out'));});
  });
  try {
    assert.equal(await(await fetch(base+'/forward')).text(),'origin');
    const first=await upgrade();
    first.resetAndDestroy();
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal(await(await fetch(base+'/health')).text(),'alive');
    const second=await upgrade();
    peer.resetAndDestroy();
    await new Promise(resolve=>second.once('close',resolve));
    assert.equal(await(await fetch(base+'/health')).text(),'alive');
    for(const socket of sockets)if(socket.localPort===port)socket.destroy();
    await new Promise(resolve=>origin.close(resolve));
    assert.equal((await fetch(base+'/forward')).status,502);
    assert.equal(await(await fetch(base+'/health')).text(),'alive');
  } finally {
    for(const socket of sockets)socket.destroy();
    origin.close();gateway.close();
  }
});
