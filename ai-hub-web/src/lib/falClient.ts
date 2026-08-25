import { completeViaGateway } from './aiGateway'
import { consumeMyAiUsage } from './aiUsageService'
import { supabase } from './supabase'
import type { ChatMessage, ChatResult } from './openaiClient'

export type FalCompleteOptions = {
  endpoint: string
  appId?: string
  skipUsageCheck?: boolean
}

export async function falComplete(
  messages: ChatMessage[],
  options: FalCompleteOptions,
): Promise<ChatResult> {
  const endpoint = options.endpoint.trim().replace(/^\/+/, '')
  if (!endpoint) {
    return { ok: false, error: 'fal.ai 모델/엔드포인트가 설정되지 않았습니다.' }
  }
  if (!supabase && !options.skipUsageCheck) {
    const usage = await consumeMyAiUsage(1)
    if (!usage.ok) return { ok: false, error: usage.error }
  }
  return completeViaGateway({
    provider: 'fal',
    messages,
    endpoint,
    appId: options.appId,
    skipUsageCheck: options.skipUsageCheck,
  })
}
