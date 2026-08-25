export type SearchHit = {
  title: string
  url: string
  snippet: string
}

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/json',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

export function uniqueHits(hits: SearchHit[], limit = 6): SearchHit[] {
  const seen = new Set<string>()
  const next: SearchHit[] = []
  for (const hit of hits) {
    if (!hit.url || seen.has(hit.url)) continue
    seen.add(hit.url)
    next.push({
      title: hit.title.trim() || hit.url,
      url: hit.url,
      snippet: hit.snippet.trim().slice(0, 400),
    })
    if (next.length >= limit) break
  }
  return next
}
