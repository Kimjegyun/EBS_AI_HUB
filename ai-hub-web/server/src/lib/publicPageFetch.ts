import { lookup } from 'dns/promises'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { isIP } from 'net'

export function isPublicIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false
  const [a, b] = address.split('.').map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) ||
    (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0))
}

/** Resolve and pin a public address, preventing redirects and DNS rebinding into the LAN. */
export async function fetchPublicHtml(raw: string, timeoutMs = 5000): Promise<string> {
  const url = new URL(raw)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      (url.port && !['80', '443'].includes(url.port))) throw new Error('Invalid public page URL')
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, family: 4 }),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error('DNS lookup timed out')), timeoutMs)
      timer.unref()
    }),
  ])
  if (!addresses.length || addresses.some(item => !isPublicIpv4(item.address))) throw new Error('Private address denied')
  const address = addresses[0].address
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      agent: false, family: 4,
      lookup: (_host, _options, callback) => callback(null, address, 4),
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'AI-Hub/1.0' },
    }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('Public page request failed')); return }
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > 1024 * 1024) request.destroy(new Error('Public page too large'))
        else chunks.push(chunk)
      })
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      response.on('error', reject)
    })
    const timer = setTimeout(() => request.destroy(new Error('Public page timed out')), timeoutMs)
    request.on('close', () => clearTimeout(timer))
    request.on('error', reject)
    request.end()
  })
}
