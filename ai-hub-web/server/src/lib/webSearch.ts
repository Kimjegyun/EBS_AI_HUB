import { searchBing } from './bingSearch'
import { searchBrave } from './braveSearch'
import { searchDuckDuckGo } from './duckDuckGoSearch'
import type { SearchHit } from './searchHttp'

export type { SearchHit }

export async function searchWeb(query: string): Promise<SearchHit[]> {
  const braveKey = process.env.BRAVE_SEARCH_API_KEY?.trim()
  if (braveKey) {
    const braveHits = await searchBrave(query, braveKey).catch(() => [])
    if (braveHits.length) return braveHits
  }

  const duckHits = await searchDuckDuckGo(query).catch(() => [])
  if (duckHits.length) return duckHits

  return searchBing(query).catch(() => [])
}
