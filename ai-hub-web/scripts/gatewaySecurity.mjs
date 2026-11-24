import { isIP } from 'node:net'

export function gatewaySecurity(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Strict-Transport-Security', 'max-age=15552000')
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()')
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; script-src 'self' blob: 'wasm-unsafe-eval' https://static.cloudflareinsights.com; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self' https: wss:; worker-src 'self' blob:; frame-src 'self' blob:; form-action 'self'")
  // cloudflared is the only public ingress and overwrites CF-Connecting-IP.
  // Ignore caller-supplied X-Forwarded-For and trust CF only on loopback ingress.
  const peer = req.socket.remoteAddress
  const cf = req.headers['cf-connecting-ip']
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)
  const ip = local && typeof cf === 'string' && isIP(cf) ? cf : peer
  req.headers['x-forwarded-for'] = ip
  req.headers['x-forwarded-proto'] = local && typeof cf === 'string' && isIP(cf) ? 'https' : 'http'
  delete req.headers['forwarded']
  delete req.headers['x-forwarded-host']
  next()
}
