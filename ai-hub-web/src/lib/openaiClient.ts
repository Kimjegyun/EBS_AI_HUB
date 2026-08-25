// Thin client for the OpenAI Responses API used by AI HUB apps.
// Organization keys stay on the server; the browser calls the AI gateway.

import { completeViaGateway } from './aiGateway'
import { consumeMyAiUsage } from './aiUsageService'
import { supabase } from './supabase'

export type ChatRole = 'system' | 'user' | 'assistant'
export type ChatMessage = { role: ChatRole; content: string }

export type ChatResult =
  | { ok: true; content: string; live?: { now: string; sources: Array<{ title: string; url: string }> } }
  | { ok: false; error: string }

export type ChatCompleteOptions = {
  model?: string
  appId?: string
  skipUsageCheck?: boolean
}

export async function chatComplete(
  messages: ChatMessage[],
  options: ChatCompleteOptions = {},
): Promise<ChatResult> {
  if (!supabase && !options.skipUsageCheck) {
    const usage = await consumeMyAiUsage(1)
    if (!usage.ok) return { ok: false, error: usage.error }
  }
  return completeViaGateway({
    provider: 'openai',
    messages,
    model: options.model,
    appId: options.appId,
    skipUsageCheck: options.skipUsageCheck,
  })
}

export async function testConnection(appId?: string): Promise<ChatResult> {
  return chatComplete(
    [
      { role: 'system', content: 'You are a connection test. Reply with the single word: OK.' },
      { role: 'user', content: 'ping' },
    ],
    { skipUsageCheck: true, appId },
  )
}
