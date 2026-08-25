import { readEnvironmentData } from '../lib/environmentStore'
import { resolveProviderConfig } from '../lib/appAiConfig'
import { appendServerIoLog } from '../lib/ioLogStore'
import { completeTencent } from './tencentComplete'
import {
  gatherLiveWebContext,
  lastUserText,
  liveSources,
  liveSystemMessage,
} from './liveWebContext'

export type ChatRole = 'system' | 'user' | 'assistant'
export type ChatMessage = { role: ChatRole; content: string }
export type ChatResult =
  | { ok: true; content: string; live?: { now: string; sources: Array<{ title: string; url: string }> } }
  | { ok: false; error: string }

type ProviderRequest = {
  provider: 'openai' | 'fal' | 'tencent'
  messages: ChatMessage[]
  model?: string
  endpoint?: string
  appId?: string
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function describeOpenAiError(status: number, body: string): string {
  let detail = body
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    detail = parsed?.error?.message ?? body
  } catch {
    /* keep raw body */
  }
  if (status === 401) return 'API 키가 올바르지 않거나 권한이 없습니다. (401)'
  if (status === 403) return '이 모델 또는 API에 접근 권한이 없습니다. (403)'
  if (status === 404) return '모델 또는 엔드포인트를 찾을 수 없습니다. 모델 이름을 확인하세요. (404)'
  if (status === 429) return '요청 한도를 초과했거나 크레딧/레이트리밋이 부족합니다. (429)'
  return `요청 실패 (${status}): ${detail}`
}

function describeFalError(status: number, body: string): string {
  let detail = body
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    detail = String(parsed.detail ?? parsed.error ?? parsed.message ?? body)
  } catch {
    /* keep raw body */
  }
  if (status === 401) return 'fal.ai API 키가 올바르지 않습니다. ADMIN 설정에서 키를 확인하세요. (401)'
  if (status === 403) return 'fal.ai 엔드포인트 접근 권한이 없습니다. 모델 권한을 확인하세요. (403)'
  if (status === 404) return 'fal.ai 모델/엔드포인트를 찾을 수 없습니다. ADMIN 설정의 엔드포인트 ID를 확인하세요. (404)'
  if (status === 429) return 'fal.ai 요청 한도 또는 크레딧이 부족합니다. (429)'
  return `fal.ai 요청 실패 (${status}): ${detail}`
}

function buildResponsesBody(model: string, messages: ChatMessage[]) {
  const instructions = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
  const input = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: [
        {
          type: message.role === 'assistant' ? 'output_text' : 'input_text',
          text: message.content,
        },
      ],
    }))

  return {
    model,
    input,
    ...(instructions ? { instructions } : {}),
  }
}

function extractOpenAiText(data: unknown): string {
  const response = data as {
    output_text?: string
    output?: Array<{ content?: Array<{ text?: string }> }>
    choices?: Array<{ message?: { content?: string } }>
  }
  if (typeof response.output_text === 'string') return response.output_text
  const outputText = response.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? '')
    .join('')
    .trim()
  if (outputText) return outputText
  return response.choices?.[0]?.message?.content ?? ''
}

function extractFalText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(extractFalText).filter(Boolean).join('\n')
  if (!value || typeof value !== 'object') return ''
  const data = value as Record<string, unknown>
  const direct =
    data.output ??
    data.text ??
    data.response ??
    data.answer ??
    data.content ??
    data.message ??
    data.generated_text
  if (direct) return extractFalText(direct)
  const choices = data.choices
  if (Array.isArray(choices)) {
    return choices
      .map((choice) => {
        const item = choice as Record<string, unknown>
        return extractFalText(item.message ?? item.text ?? item.content)
      })
      .filter(Boolean)
      .join('\n')
  }
  return extractFalText(data.data ?? data.result)
}

async function completeOpenAi(
  messages: ChatMessage[],
  config: Record<string, unknown>,
  requestedModel?: string,
): Promise<ChatResult> {
  const apiKey = asString(config.ai_openai_api_key)
  const baseUrl = (asString(config.ai_openai_base_url) || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = requestedModel?.trim() || asString(config.ai_openai_model) || 'gpt-5.6-luna'
  if (!apiKey) {
    return { ok: false, error: 'OpenAI API 키가 설정되지 않았습니다. 설정에서 API 키를 입력하세요.' }
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
  const res = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildResponsesBody(model, messages)),
  })
  if (!res.ok) {
    if (res.status === 400 || res.status === 404) {
      const fallback = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, messages }),
      })
      if (!fallback.ok) {
        return { ok: false, error: describeOpenAiError(fallback.status, await fallback.text()) }
      }
      const data = await fallback.json()
      return { ok: true, content: extractOpenAiText(data) || '응답 본문이 비어 있습니다. 모델 응답 형식을 확인하세요.' }
    }
    return { ok: false, error: describeOpenAiError(res.status, await res.text()) }
  }
  const data = await res.json()
  const content = extractOpenAiText(data)
  return { ok: true, content: content || '응답 본문이 비어 있습니다. 모델 응답 형식을 확인하세요.' }
}

async function completeFal(
  messages: ChatMessage[],
  config: Record<string, unknown>,
  endpoint?: string,
): Promise<ChatResult> {
  const apiKey = asString(config.ai_fal_api_key)
  const baseUrl = (asString(config.ai_fal_base_url) || 'https://queue.fal.run').replace(/\/+$/, '')
  const resolvedEndpoint = (endpoint || '').trim().replace(/^\/+/, '')
  if (!apiKey) {
    return { ok: false, error: 'fal.ai API 키가 설정되지 않았습니다. ADMIN 설정에서 fal.ai 키를 저장하세요.' }
  }
  if (!resolvedEndpoint) {
    return { ok: false, error: 'fal.ai 모델/엔드포인트가 설정되지 않았습니다.' }
  }

  const prompt = messages.map((message) => `${message.role}: ${message.content}`).join('\n\n')
  const res = await fetch(`${baseUrl}/${resolvedEndpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, messages, input: prompt }),
  })
  if (!res.ok) {
    return { ok: false, error: describeFalError(res.status, await res.text()) }
  }
  const data = await res.json()
  const content = extractFalText(data)
  return {
    ok: true,
    content: content || 'fal.ai 응답을 받았지만 텍스트 필드를 찾지 못했습니다. 엔드포인트 응답 형식을 확인하세요.',
  }
}

export async function completeWithStoredKeys(request: ProviderRequest): Promise<ChatResult> {
  const env = await readEnvironmentData()
  const appId = request.provider === 'tencent' ? request.appId || 'my-llm' : request.appId
  const config = resolveProviderConfig(env, appId)
  if (request.provider === 'tencent') {
    const live = await gatherLiveWebContext(lastUserText(request.messages))
    appendServerIoLog({
      direction: 'cmd',
      channel: 'web',
      title: live.searched ? `웹 검색 ${live.hits.length}건` : '웹 검색 생략',
      body: [`now=${live.clock.display}`, live.query ? `q=${live.query}` : '', ...live.hits.map((hit) => hit.url)]
        .filter(Boolean)
        .join('\n'),
    })
    const result = await completeTencent({
      messages: [
        { role: 'system', content: liveSystemMessage(live) },
        ...request.messages,
      ],
      config,
      model: request.model,
      apiUrl: request.endpoint,
    })
    if (result.ok) {
      return {
        ok: true,
        content: result.content,
        live: { now: live.clock.display, sources: liveSources(live) },
      }
    }
    return result
  }
  if (request.provider === 'fal') {
    return completeFal(request.messages, config, request.endpoint)
  }
  return completeOpenAi(request.messages, config, request.model)
}
