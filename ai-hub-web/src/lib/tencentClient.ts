import { completeViaGateway } from './aiGateway'
import { authHeaders } from './authHeaders'
import { consumeMyAiUsage } from './aiUsageService'
import { supabase } from './supabase'
import type { ChatMessage, ChatResult } from './openaiClient'
import { MY_LLM_APP_ID } from './tencentCatalog'

export type TencentCompleteOptions = {
  model: string
  apiUrl: string
  skipUsageCheck?: boolean
}

function asChatResult(value: unknown): ChatResult {
  if (!value || typeof value !== 'object') {
    return { ok: false, error: 'Tencent 연결 테스트 응답이 올바르지 않습니다.' }
  }
  const data = value as { ok?: unknown; content?: unknown; error?: unknown; live?: unknown }
  if (data.ok === true && typeof data.content === 'string') {
    const live = asLiveMeta(data.live)
    return live ? { ok: true, content: data.content, live } : { ok: true, content: data.content }
  }
  if (typeof data.error === 'string' && data.error) {
    if (/ByteString|greater than 255/i.test(data.error)) {
      return {
        ok: false,
        error: '키에 한글이 섞여 있어 인증 헤더를 만들 수 없습니다. Token 값만 다시 붙여넣고 저장하세요.',
      }
    }
    return { ok: false, error: data.error }
  }
  return { ok: false, error: 'Tencent 연결 테스트에 실패했습니다.' }
}

function asLiveMeta(value: unknown): { now: string; sources: Array<{ title: string; url: string }> } | null {
  if (!value || typeof value !== 'object') return null
  const data = value as { now?: unknown; sources?: unknown }
  if (typeof data.now !== 'string' || !Array.isArray(data.sources)) return null
  const sources = data.sources
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const source = item as { title?: unknown; url?: unknown }
      if (typeof source.url !== 'string' || !source.url) return null
      return {
        title: typeof source.title === 'string' && source.title ? source.title : source.url,
        url: source.url,
      }
    })
    .filter((item): item is { title: string; url: string } => Boolean(item))
  return { now: data.now, sources }
}

export async function tencentComplete(
  messages: ChatMessage[],
  options: TencentCompleteOptions,
): Promise<ChatResult> {
  const model = options.model.trim()
  const apiUrl = options.apiUrl.trim()
  if (!model) return { ok: false, error: 'Tencent 모델이 선택되지 않았습니다.' }
  if (!apiUrl) return { ok: false, error: 'Tencent 모델 API 주소가 설정되지 않았습니다.' }
  if (!supabase && !options.skipUsageCheck) {
    const usage = await consumeMyAiUsage(1)
    if (!usage.ok) return { ok: false, error: usage.error }
  }
  return completeViaGateway({
    provider: 'tencent',
    messages,
    model,
    endpoint: apiUrl,
    appId: MY_LLM_APP_ID,
    skipUsageCheck: options.skipUsageCheck,
  })
}

export async function testTencentConnection(): Promise<ChatResult> {
  try {
    const res = await fetch('/api/ai/tencent-test', { method: 'POST', headers: authHeaders() })
    const payload = await res.json().catch(() => null)
    return asChatResult(payload)
  } catch (err) {
    return {
      ok: false,
      error: `로컬 AI 게이트웨이에 연결하지 못했습니다: ${(err as Error).message}`,
    }
  }
}
