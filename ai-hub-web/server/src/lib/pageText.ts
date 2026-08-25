import { fetchText, stripHtml } from './searchHttp'

function isPublicHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0') return false
    if (host === '::1' || host.startsWith('[')) return false
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return false
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false
    return true
  } catch {
    return false
  }
}

export async function fetchPublicPageText(url: string): Promise<string> {
  if (!isPublicHttpUrl(url)) return ''
  if (/\.(pdf|zip|png|jpe?g|gif|webp|mp4|mp3)(\?|$)/i.test(url)) return ''
  const html = await fetchText(url, 5000)
  return stripHtml(html).slice(0, 1800)
}
