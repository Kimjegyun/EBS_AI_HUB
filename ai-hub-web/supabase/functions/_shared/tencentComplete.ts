export type ChatRole = 'system' | 'user' | 'assistant'
export type ChatMessage = { role: ChatRole; content: string }
export type ChatResult = { ok: true; content: string } | { ok: false; error: string }

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeTencentApiKey(raw: string): string {
  let key = raw.replace(/^\uFEFF/, '').trim()
  key = key.replace(/^authorization\s*:\s*/i, '').trim()
  key = key.replace(/^bearer\s+/i, '').trim()
  key = key
    .replace(/^(?:tencent\s+)?(?:aigc\s+)?api\s*(?:키|토큰|token)\s*[:：]?\s*/i, '')
    .trim()
  key = key.replace(/^(?:키|토큰)\s*[:：]\s*/i, '').trim()
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim()
  }
  return key.replace(/\s+/g, '')
}

function describeTencentKeyProblem(raw: string): string | null {
  const key = normalizeTencentApiKey(raw)
  if (!key) return 'Tencent API 키가 비어 있습니다. 칸 이름 말고 Token 값만 붙여넣으세요.'
  if ([...key].some((ch) => ch.charCodeAt(0) > 127)) {
    return '키에 한글이나 유니코드가 들어 있습니다. CreateAigcApiToken으로 발급한 Token 값만 붙여넣으세요.'
  }
  if (/^akid/i.test(key)) {
    return 'SecretId가 아니라 CreateAigcApiToken으로 발급한 AIGC API Token을 입력하세요.'
  }
  return null
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
    const hint =
      'CreateAigcApiToken으로 발급한 AIGC API Token인지 확인하세요. SecretId/SecretKey가 아니며, 방금 발급했다면 약 1분 후 다시 시도하세요.'
    const snippet = String(detail || '').replace(/\s+/g, ' ').trim().slice(0, 180)
    return snippet
      ? `Tencent 인증 실패 (401): ${snippet} · ${hint}`
      : `Tencent API 키가 올바르지 않거나 권한이 없습니다. (401) · ${hint}`
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
    Authorization: `Bearer ${apiKey}`,
  }
  if (protocol === 'messages') {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
  }

  const body =
    protocol === 'messages'
      ? buildAnthropicBody(model, options.messages)
      : protocol === 'responses'
        ? buildResponsesBody(model, options.messages)
        : { model, messages: options.messages }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    return { ok: false, error: describeTencentError(res.status, await res.text()) }
  }
  const data = await res.json()
  const content = protocol === 'messages' ? extractAnthropicText(data) : extractOpenAiText(data)
  return {
    ok: true,
    content: content || '응답 본문이 비어 있습니다. Tencent 모델 응답 형식을 확인하세요.',
  }
}
