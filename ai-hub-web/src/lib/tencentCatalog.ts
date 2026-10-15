export const MY_LLM_APP_ID = 'my-llm'
export const DEFAULT_TENCENT_BASE_URL = 'https://text-aigc.vod-qcloud.com'

export type TencentProtocol = 'completions' | 'responses' | 'messages'
export type TencentProviderId =
  | 'openai'
  | 'gemini'
  | 'claude'
  | 'grok'
  | 'deepseek'
  | 'glm'
  | 'kimi'
  | 'minimax'

export type TencentModelConfig = {
  id: string
  label: string
  provider: TencentProviderId
  protocol: TencentProtocol
  apiUrl: string
  enabled: boolean
}

export const TENCENT_PROVIDERS: Array<{ id: TencentProviderId; name: string }> = [
  { id: 'openai', name: 'ChatGPT' },
  { id: 'claude', name: 'Claude' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'grok', name: 'Grok' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'kimi', name: 'Kimi' },
]

export function tencentApiUrl(protocol: TencentProtocol, baseUrl = DEFAULT_TENCENT_BASE_URL): string {
  const root = baseUrl.replace(/\/+$/, '')
  if (protocol === 'responses') return `${root}/v1/responses`
  if (protocol === 'messages') return `${root}/v1/messages`
  return `${root}/v1/chat/completions`
}

export function protocolFromApiUrl(apiUrl: string): TencentProtocol {
  if (apiUrl.includes('/v1/messages')) return 'messages'
  if (apiUrl.includes('/v1/responses')) return 'responses'
  return 'completions'
}

function entry(
  id: string,
  label: string,
  provider: TencentProviderId,
  protocol: TencentProtocol = 'completions',
): TencentModelConfig {
  return {
    id,
    label,
    provider,
    protocol,
    apiUrl: tencentApiUrl(protocol),
    enabled: false,
  }
}

/** 카탈로그에서 뺀 모델. 이전 저장본이 extras로 다시 나타나지 않게 한다. */
const RETIRED_MODEL_IDS = new Set([
  'gpt-5.3-codex',
  'gpt-5.3-chat',
  'gpt-5.2-chat',
  'gpt-5.2',
  'gpt-5.1',
  'gpt-5.1-chat',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-chat',
  'gpt-5-nano',
  'gpt-chat-latest',
  'gpt-4.1',
  'gpt-4o',
  'cd-opus-4.5',
  'cd-sonnet-4.5',
  'cd-haiku-4.5',
  'glm-5.1',
  'glm-5',
  'glm-5-turbo',
  'minimax-m2.7',
  'minimax-m2.5',
  'gk-4-1-fast-reasoning',
  'gk-4.1-fast-non-reasoning',
  // 2026-10: 제공사별 최신 4개만 남기면서 뺀 모델
  'gpt-5.4-nano',
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'cd-opus-4.8',
  'cd-opus-4.7',
  'cd-opus-4.6',
  'cd-sonnet-4.6',
  'kimi-k2.5',
])

const RETIRED_PROVIDER_IDS = new Set<TencentProviderId>(['glm', 'minimax'])

/**
 * Tencent Text Generation 모델 — 제공사별 최신 모델 최대 4개.
 * 문서(https://doc.tencentpoc.com/justinkim/page#text)에 아직 없는 Claude 5 계열과 Kimi K3,
 * Gemini 3.5 Flash Lite는 2026-10-08 게이트웨이에 직접 호출해 응답을 확인했다.
 * Grok·DeepSeek는 게이트웨이가 제공하는 모델이 3개뿐이다.
 */
export const TENCENT_MODEL_CATALOG: TencentModelConfig[] = [
  entry('gpt-5.5', 'GPT-5.5', 'openai'),
  entry('gpt-5.4-pro', 'GPT-5.4 Pro', 'openai', 'responses'),
  entry('gpt-5.4', 'GPT-5.4', 'openai'),
  entry('gpt-5.4-mini', 'GPT-5.4 Mini', 'openai'),
  entry('cd-fable-5.1', 'Claude Fable 5.1', 'claude', 'messages'),
  entry('cd-opus-5.5', 'Claude Opus 5.5', 'claude', 'messages'),
  entry('cd-opus-5', 'Claude Opus 5', 'claude', 'messages'),
  entry('cd-sonnet-5', 'Claude Sonnet 5', 'claude', 'messages'),
  entry('gemini-3.5-flash', 'Gemini 3.5 Flash', 'gemini'),
  entry('gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite', 'gemini'),
  entry('gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', 'gemini'),
  entry('gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', 'gemini'),
  entry('gk-4.3', 'Grok 4.3', 'grok'),
  entry('gk-4-20-reasoning', 'Grok 4.20 Reasoning', 'grok'),
  entry('gk-4-20-non-reasoning', 'Grok 4.20 Non-reasoning', 'grok'),
  entry('deepseek-v4-pro', 'DeepSeek V4 Pro', 'deepseek'),
  entry('deepseek-v4-flash', 'DeepSeek V4 Flash', 'deepseek'),
  entry('deepseek-v3.2', 'DeepSeek V3.2', 'deepseek'),
  entry('kimi-k3', 'Kimi K3', 'kimi'),
  entry('kimi-k2.6', 'Kimi K2.6', 'kimi'),
]

export function mergeTencentModels(saved: TencentModelConfig[] | undefined): TencentModelConfig[] {
  const byId = new Map((saved ?? []).map((model) => [model.id, model]))
  // 관리자가 쓰던 제공사에 새 모델이 추가되면 바로 고를 수 있게 켠다.
  // 그 제공사의 예전 모델이 빠져도 제공사 자체가 사용자 목록에서 사라지지 않는다.
  const providersInUse = new Set((saved ?? []).filter((model) => model.enabled === true).map((model) => model.provider))
  const merged = TENCENT_MODEL_CATALOG.map((catalog) => {
    const existing = byId.get(catalog.id)
    if (!existing) return { ...catalog, enabled: providersInUse.has(catalog.provider) }
    return {
      ...catalog,
      label: existing.label.trim() || catalog.label,
      apiUrl: existing.apiUrl.trim() || catalog.apiUrl,
      enabled: existing.enabled === true,
      protocol: protocolFromApiUrl(existing.apiUrl.trim() || catalog.apiUrl),
    }
  })
  const extras = (saved ?? []).filter(
    (model) =>
      !RETIRED_MODEL_IDS.has(model.id) &&
      !RETIRED_PROVIDER_IDS.has(model.provider) &&
      !TENCENT_MODEL_CATALOG.some((item) => item.id === model.id),
  )
  return [
    ...merged,
    ...extras.map((model, index) => ({
      id: model.id.trim() || `custom-${index}`,
      label: model.label.trim() || model.id,
      provider: model.provider || 'openai',
      protocol: protocolFromApiUrl(model.apiUrl),
      apiUrl: model.apiUrl.trim() || tencentApiUrl('completions'),
      enabled: model.enabled === true,
    })),
  ]
}

export function enabledTencentModels(models: TencentModelConfig[]): TencentModelConfig[] {
  return models.filter((model) => model.enabled === true && Boolean(model.id.trim()) && Boolean(model.apiUrl.trim()))
}
