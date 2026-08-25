import { appendServerIoLog } from '../lib/ioLogStore'
import {
  describeTencentHeaderError,
  describeTencentKeyProblem,
  normalizeTencentApiKey,
  tencentAuthHeaders,
  tencentKeyShape,
} from '../lib/tencentApiKey'

export type ChatRole = 'system' | 'user' | 'assistant'
export type ChatMessage = { role: ChatRole; content: string }
export type ChatResult = { ok: true; content: string } | { ok: false; error: string }

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function describeTencentError(status: number, body: string): string {
  let detail = body
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string }
    if (typeof parsed.error === 'string') detail = parsed.error
    else detail = parsed.error?.message || parsed.message || body
  } catch {
    /* keep raw body */
  }
  if (status === 401) {
    const snippet = String(detail || '').replace(/\s+/g, ' ').trim().slice(0, 180)
    const hint = [
      'Tencent 서버가 이 Token을 거절했습니다.',
      '넣을 값: VOD CreateAigcApiToken 응답의 ApiToken.',
      '넣으면 안 되는 값: SecretId(AKID…), SecretKey, OpenAI 키(sk-proj-…).',
      '방금 발급했다면 1분 후 다시 시도하고, Token에 IP 제한이 있으면 이 PC의 공인 IP를 허용하세요.',
    ].join(' ')
    return snippet ? `Tencent 인증 실패 (401): ${snippet} · ${hint}` : hint
  }
  if (status === 403) return '이 Tencent 모델 또는 API에 접근 권한이 없습니다. (403)'
  if (status === 404) return 'Tencent 모델 또는 API 주소를 찾을 수 없습니다. (404)'
  if (status === 429) return 'Tencent 요청 한도 또는 쿼터가 부족합니다. (429)'
  return `Tencent 요청 실패 (${status}): ${detail}`
}

function protocolFromUrl(apiUrl: string): 'completions' | 'responses' | 'messages' {
  if (apiUrl.includes('/v1/messages')) return 'messages'
  if (apiUrl.includes('/v1/responses')) return 'responses'
  return 'completions'
}

function isAllowedTencentUrl(apiUrl: string, baseUrl: string): boolean {
  try {
    const parsed = new URL(apiUrl)
    const base = new URL(baseUrl || 'https://text-aigc.vod-qcloud.com')
    return parsed.protocol === 'https:' && (parsed.host === 'text-aigc.vod-qcloud.com' || parsed.host === base.host)
  } catch {
    return false
  }
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
  return { model, input, ...(instructions ? { instructions } : {}) }
}

function extractOpenAiText(data: unknown): string {
  const response = data as {
    output_text?: string
    output?: Array<{ content?: Array<{ text?: string }> }>
    choices?: Array<{ message?: { content?: string } }>
    content?: Array<{ text?: string }> | string
  }
  if (typeof response.output_text === 'string') return response.output_text
  const outputText = response.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? '')
    .join('')
    .trim()
  if (outputText) return outputText
  const choice = response.choices?.[0]?.message?.content
  if (choice) return choice
  if (typeof response.content === 'string') return response.content
  if (Array.isArray(response.content)) {
    return response.content.map((part) => part.text ?? '').join('').trim()
  }
  return ''
}

function extractAnthropicText(data: unknown): string {
  const response = data as { content?: Array<{ text?: string }> | string }
  if (typeof response.content === 'string') return response.content
  if (Array.isArray(response.content)) {
    return response.content.map((part) => part.text ?? '').join('').trim()
  }
  return extractOpenAiText(data)
}

function buildAnthropicBody(model: string, messages: ChatMessage[]) {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
  const chat = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }))
  return {
    model,
    max_tokens: 4096,
    ...(system ? { system } : {}),
    messages: chat,
  }
}

export async function completeTencent(options: {
  messages: ChatMessage[]
  config: Record<string, unknown>
  model?: string
  apiUrl?: string
}): Promise<ChatResult> {
  const apiKey = normalizeTencentApiKey(asString(options.config.ai_tencent_api_key))
  const keyProblem = describeTencentKeyProblem(apiKey)
  const baseUrl = (asString(options.config.ai_tencent_base_url) || 'https://text-aigc.vod-qcloud.com').replace(/\/+$/, '')
  const model = asString(options.model)
  const apiUrl = asString(options.apiUrl)
  if (keyProblem) {
    return { ok: false, error: keyProblem }
  }
  if (!apiKey) {
    return { ok: false, error: 'Tencent API 키가 설정되지 않았습니다. 설정에서 키를 입력하세요.' }
  }
  if (!model) {
    return { ok: false, error: 'Tencent 모델이 선택되지 않았습니다.' }
  }
  if (!apiUrl || !isAllowedTencentUrl(apiUrl, baseUrl)) {
    return { ok: false, error: '허용되지 않은 Tencent API 주소입니다. 설정에서 모델 API 주소를 확인하세요.' }
  }

  const protocol = protocolFromUrl(apiUrl)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...tencentAuthHeaders(apiKey, protocol),
  }

  const body =
    protocol === 'messages'
      ? buildAnthropicBody(model, options.messages)
      : protocol === 'responses'
        ? buildResponsesBody(model, options.messages)
        : { model, messages: options.messages }

  appendServerIoLog({
    direction: 'out',
    channel: 'tencent',
    title: `POST ${apiUrl}  model=${model}`,
    body: JSON.stringify(body, null, 2),
  })

  let res: Response
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  } catch (err) {
    const error =
      describeTencentHeaderError(err) ||
      (err instanceof Error ? err.message : 'Tencent 요청에 실패했습니다.')
    appendServerIoLog({
      direction: 'error',
      channel: 'tencent',
      title: `FAIL ${apiUrl}  model=${model}`,
      body: error,
    })
    return { ok: false, error }
  }
  if (!res.ok) {
    const error = describeTencentError(res.status, await res.text())
    appendServerIoLog({
      direction: 'error',
      channel: 'tencent',
      title: `FAIL ${apiUrl}  model=${model}`,
      body: error,
    })
    return { ok: false, error }
  }
  const data = await res.json()
  const content = protocol === 'messages' ? extractAnthropicText(data) : extractOpenAiText(data)
  const result = {
    ok: true as const,
    content: content || '응답 본문이 비어 있습니다. Tencent 모델 응답 형식을 확인하세요.',
  }
  appendServerIoLog({
    direction: 'in',
    channel: 'tencent',
    title: `OK ${apiUrl}  model=${model}`,
    body: result.content,
  })
  return result
}

export async function pingTencent(config: Record<string, unknown>): Promise<ChatResult> {
  const apiKey = normalizeTencentApiKey(asString(config.ai_tencent_api_key))
  const keyProblem = describeTencentKeyProblem(apiKey)
  if (keyProblem) return { ok: false, error: keyProblem }
  const baseUrl = (asString(config.ai_tencent_base_url) || 'https://text-aigc.vod-qcloud.com').replace(/\/+$/, '')
  const shape = tencentKeyShape(apiKey)
  const withShape = (error: string) => `${error} (${shape})`

  const modelsUrl = `${baseUrl}/v1/models`
  appendServerIoLog({
    direction: 'out',
    channel: 'tencent',
    title: `GET ${modelsUrl}`,
    body: `connection test · ${shape}`,
  })

  try {
    const catalogRes = await fetch(modelsUrl, {
      method: 'GET',
      headers: tencentAuthHeaders(apiKey),
    })
    if (catalogRes.ok) {
      const data = (await catalogRes.json().catch(() => null)) as { data?: unknown } | null
      const count = Array.isArray(data?.data) ? data.data.length : 0
      const content = count > 0 ? `연결 성공 · 사용 가능 모델 ${count}개` : '연결 성공'
      appendServerIoLog({
        direction: 'in',
        channel: 'tencent',
        title: `OK ${modelsUrl}`,
        body: content,
      })
      return { ok: true, content }
    }

    const catalogBody = await catalogRes.text()
    const chatUrl = `${baseUrl}/v1/chat/completions`
    appendServerIoLog({
      direction: 'out',
      channel: 'tencent',
      title: `POST ${chatUrl}`,
      body: `connection test fallback · ${shape}`,
    })
    const chatRes = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...tencentAuthHeaders(apiKey),
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
      }),
    })
    if (chatRes.ok) {
      const content = '연결 성공 · 채팅 API 인증 확인'
      appendServerIoLog({
        direction: 'in',
        channel: 'tencent',
        title: `OK ${chatUrl}`,
        body: content,
      })
      return { ok: true, content }
    }

    const chatBody = await chatRes.text()
    const authFailed =
      chatRes.status === 401 ||
      catalogRes.status === 401 ||
      /invalid api key|unauthorized|authentication/i.test(`${catalogBody}\n${chatBody}`)
    if (!authFailed && (chatRes.status === 400 || chatRes.status === 404)) {
      const content = '인증은 성공했습니다. 모델 이름 또는 엔드포인트를 확인하세요.'
      appendServerIoLog({
        direction: 'in',
        channel: 'tencent',
        title: `AUTH OK ${chatUrl}`,
        body: `${content}\n${chatBody.slice(0, 300)}`,
      })
      return { ok: true, content }
    }

    const error = withShape(describeTencentError(chatRes.status || catalogRes.status, chatBody || catalogBody))
    appendServerIoLog({
      direction: 'error',
      channel: 'tencent',
      title: `FAIL ${chatUrl}`,
      body: error,
    })
    return { ok: false, error }
  } catch (err) {
    const error = withShape(
      describeTencentHeaderError(err) ||
        (err instanceof Error ? err.message : 'Tencent 연결 테스트에 실패했습니다.'),
    )
    appendServerIoLog({
      direction: 'error',
      channel: 'tencent',
      title: `FAIL ${baseUrl}`,
      body: error,
    })
    return { ok: false, error }
  }
}
