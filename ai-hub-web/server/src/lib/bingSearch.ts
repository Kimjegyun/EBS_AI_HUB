import { fetchText, stripHtml, uniqueHits, type SearchHit } from './searchHttp'

export async function searchBing(query: string): Promise<SearchHit[]> {
  const html = await fetchText(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=ko&cc=KR`,
  )
  const hits: SearchHit[] = []
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/gi) ?? []
  for (const block of blocks) {
    const link = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!link) continue
    const url = link[1] ?? ''
    if (!/^https?:\/\//i.test(url)) continue
    const snippet = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    hits.push({
      title: stripHtml(link[2] ?? ''),
      url,
      snippet: stripHtml(snippet?.[1] ?? ''),
    })
  }
  return uniqueHits(hits)
}
