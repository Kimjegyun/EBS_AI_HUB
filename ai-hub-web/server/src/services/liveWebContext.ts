import { fetchPublicPageText } from '../lib/pageText'
import { readSystemClock, type SystemClock } from '../lib/systemClock'
import { searchWeb, type SearchHit } from '../lib/webSearch'

const TRIVIAL = /^(안녕|안녕하세요|하이|hello|hi|ㅎㅇ|ㅇㅋ|ok|okay|thanks|고마워|감사)[\s!?.]*$/i

export type LiveSource = {
  title: string
  url: string
}

export type LiveWebContext = {
  clock: SystemClock
  searched: boolean
  query: string
  hits: SearchHit[]
  error?: string
}

export function lastUserText(messages: Array<{ role: string; content: string }>): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user' && message.content.trim()) return message.content.trim()
  }
  return ''
}

function shouldSearch(text: string): boolean {
  if (!text || TRIVIAL.test(text)) return false
  if (text.length > 2500) return false
  return true
}

function searchQuery(text: string, clock: SystemClock): string {
  if (/\d{4}/.test(text)) return text.slice(0, 300)
  return `${text.slice(0, 240)} ${clock.isoDate}`
}

export async function gatherLiveWebContext(userText: string): Promise<LiveWebContext> {
  const clock = readSystemClock()
  if (!shouldSearch(userText)) {
    return { clock, searched: false, query: '', hits: [] }
  }

  const query = searchQuery(userText, clock)
  try {
    const hits = await searchWeb(query)
    const excerpts = await Promise.all(
      hits.slice(0, 2).map(async (hit) => {
        const text = await fetchPublicPageText(hit.url).catch(() => '')
        return text ? { ...hit, snippet: [hit.snippet, text].filter(Boolean).join(' ') } : hit
      }),
    )
    const merged = hits.map((hit, index) => (index < excerpts.length ? excerpts[index] : hit))
    return { clock, searched: true, query, hits: merged }
  } catch (error) {
    return {
      clock,
      searched: true,
      query,
      hits: [],
      error: error instanceof Error ? error.message : '웹 검색에 실패했습니다.',
    }
  }
}

export function liveSystemMessage(ctx: LiveWebContext): string {
  const lines = [
    `오늘은 이 PC 시스템 날짜 기준 ${ctx.clock.display}이다.`,
    '학습 데이터가 이 날짜보다 오래됐더라도, 아래 웹 검색 결과를 우선해 답한다.',
    '검색 결과에 없는 최신 사실은 추측하지 말고 모른다고 하며, 사용한 출처 URL을 밝힌다.',
  ]

  if (!ctx.searched) {
    lines.push('이번 질문은 웹 검색을 생략했다. 날짜만 위 시스템 시각을 기준으로 한다.')
    return lines.join('\n')
  }

  if (ctx.error || ctx.hits.length === 0) {
    lines.push(`웹 검색 질의: ${ctx.query}`)
    lines.push(`웹 검색 실패 또는 결과 없음${ctx.error ? `: ${ctx.error}` : ''}.`)
    lines.push('최신 사실이 필요하면 검색 실패를 알리고, 학습 지식은 날짜가 불확실하다고 밝혀라.')
    return lines.join('\n')
  }

  lines.push(`웹 검색 질의: ${ctx.query}`)
  lines.push('웹 검색 결과:')
  ctx.hits.forEach((hit, index) => {
    lines.push(`${index + 1}. ${hit.title}`)
    lines.push(`   URL: ${hit.url}`)
    if (hit.snippet) lines.push(`   ${hit.snippet.slice(0, 500)}`)
  })
  return lines.join('\n')
}

export function liveSources(ctx: LiveWebContext): LiveSource[] {
  return ctx.hits.map((hit) => ({ title: hit.title, url: hit.url }))
}
