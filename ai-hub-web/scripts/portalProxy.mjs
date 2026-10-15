import http from 'node:http';

export function proxyHttp(req, res, port) {
  const upstream = http.request({hostname:'127.0.0.1',port,path:req.originalUrl || req.url,method:req.method,headers:req.headers}, response => {
    response.on('error', () => res.destroy());
    res.writeHead(response.statusCode || 502, response.headers);
    response.pipe(res);
  });
  upstream.on('error', () => {
    if (res.destroyed) return;
    if (res.headersSent) return res.destroy();
    res.writeHead(502, {'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({error:'Upstream unavailable'}));
  });
  req.on('error', () => upstream.destroy());
  req.on('aborted', () => upstream.destroy());
  res.on('error', () => upstream.destroy());
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
}

export function proxyUpgrade(req, socket, head, port) {
  const upstream = http.request({hostname:'127.0.0.1',port,path:req.url,headers:req.headers});
  let peer;
  const close = () => { upstream.destroy(); peer?.destroy(); socket.destroy(); };
  // Handle both ends before exchanging data: a reset must never terminate the gateway.
  socket.on('error', close);
  socket.on('close', () => { upstream.destroy(); peer?.destroy(); });
  upstream.on('error', close);
  upstream.on('response', () => close());
  upstream.on('upgrade', (response, upstreamSocket, upstreamHead) => {
    peer = upstreamSocket;
    peer.on('error', close);
    peer.on('close', () => socket.destroy());
    if (socket.destroyed) return close();
    const headers = Object.entries(response.headers).flatMap(([name,value]) =>
      (Array.isArray(value) ? value : [value]).filter(value => typeof value === 'string').map(value => `${name}: ${value}`));
    socket.write(`HTTP/1.1 ${response.statusCode || 101} ${response.statusMessage || 'Switching Protocols'}\r\n${headers.join('\r\n')}\r\n\r\n`);
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) peer.write(head);
    peer.pipe(socket);
    socket.pipe(peer);
  });
  upstream.end();
}
