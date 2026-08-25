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
])

const RETIRED_PROVIDER_IDS = new Set<TencentProviderId>(['glm', 'minimax'])

/** Tencent Text Generation 지원 모델 — https://doc.tencentpoc.com/justinkim/page#text */
export const TENCENT_MODEL_CATALOG: TencentModelConfig[] = [
  entry('gpt-5.5', 'GPT-5.5', 'openai'),
  entry('gpt-5.4-pro', 'GPT-5.4 Pro', 'openai', 'responses'),
  entry('gpt-5.4', 'GPT-5.4', 'openai'),
  entry('gpt-5.4-nano', 'GPT-5.4 Nano', 'openai'),
  entry('gpt-5.4-mini', 'GPT-5.4 Mini', 'openai'),
  entry('gemini-3.5-flash', 'Gemini 3.5 Flash', 'gemini'),
  entry('gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', 'gemini'),
  entry('gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', 'gemini'),
  entry('gemini-3.1-flash-lite-preview', 'Gemini 3.1 Flash Lite Preview', 'gemini'),
  entry('gemini-3-flash-preview', 'Gemini 3 Flash Preview', 'gemini'),
  entry('gemini-2.5-pro', 'Gemini 2.5 Pro', 'gemini'),
  entry('gemini-2.5-flash', 'Gemini 2.5 Flash', 'gemini'),
  entry('cd-opus-4.8', 'Claude Opus 4.8', 'claude', 'messages'),
  entry('cd-opus-4.7', 'Claude Opus 4.7', 'claude', 'messages'),
  entry('cd-opus-4.6', 'Claude Opus 4.6', 'claude', 'messages'),
  entry('cd-sonnet-4.6', 'Claude Sonnet 4.6', 'claude', 'messages'),
  entry('gk-4.3', 'Grok 4.3', 'grok'),
  entry('gk-4-20-reasoning', 'Grok 4.20 Reasoning', 'grok'),
  entry('gk-4-20-non-reasoning', 'Grok 4.20 Non-reasoning', 'grok'),
  entry('deepseek-v4-pro', 'DeepSeek V4 Pro', 'deepseek'),
  entry('deepseek-v4-flash', 'DeepSeek V4 Flash', 'deepseek'),
  entry('deepseek-v3.2', 'DeepSeek V3.2', 'deepseek'),
  entry('kimi-k2.6', 'Kimi K2.6', 'kimi'),
  entry('kimi-k2.5', 'Kimi K2.5', 'kimi'),
]

export function mergeTencentModels(saved: TencentModelConfig[] | undefined): TencentModelConfig[] {
  const byId = new Map((saved ?? []).map((model) => [model.id, model]))
  const merged = TENCENT_MODEL_CATALOG.map((catalog) => {
    const existing = byId.get(catalog.id)
    if (!existing) return { ...catalog, enabled: false }
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
