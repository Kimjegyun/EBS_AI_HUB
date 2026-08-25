import { fetchText, stripHtml, uniqueHits, type SearchHit } from './searchHttp'

function unwrapDuckUrl(href: string): string {
  try {
    const parsed = new URL(href, 'https://duckduckgo.com')
    const target = parsed.searchParams.get('uddg')
    if (target) return decodeURIComponent(target)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href
  } catch {
    /* ignore */
  }
  return ''
}

export async function searchDuckDuckGo(query: string): Promise<SearchHit[]> {
  const html = await fetchText(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
  )
  const hits: SearchHit[] = []
  const blockRe = /<div class="result[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi
  const blocks = html.match(blockRe) ?? []
  for (const block of blocks) {
    const link = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!link) continue
    const url = unwrapDuckUrl(link[1] ?? '')
    if (!url) continue
    const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i)
    hits.push({
      title: stripHtml(link[2] ?? ''),
      url,
      snippet: stripHtml(snippet?.[1] ?? ''),
    })
  }
  return uniqueHits(hits)
}
