import { uniqueHits, type SearchHit } from './searchHttp'

export async function searchBrave(query: string, apiKey: string): Promise<SearchHit[]> {
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8&search_lang=ko&country=KR`,
    {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(8000),
    },
  )
  if (!res.ok) throw new Error(`Brave HTTP ${res.status}`)
  const payload = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> }
  }
  const hits = (payload.web?.results ?? []).map((item) => ({
    title: item.title ?? '',
    url: item.url ?? '',
    snippet: item.description ?? '',
  }))
  return uniqueHits(hits)
}
