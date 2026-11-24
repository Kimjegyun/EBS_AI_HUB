export const SECRET_ENV_KEYS = ['ai_openai_api_key', 'ai_fal_api_key', 'ai_tencent_api_key', 'ai_together_api_key'] as const

export const SECRET_CONFIGURED_FLAGS = {
  ai_openai_api_key: 'ai_openai_api_key_configured',
  ai_fal_api_key: 'ai_fal_api_key_configured',
  ai_tencent_api_key: 'ai_tencent_api_key_configured',
  ai_together_api_key: 'ai_together_api_key_configured',
} as const

export const SECRET_CLEAR_FLAGS = {
  ai_openai_api_key: 'ai_openai_api_key_clear',
  ai_fal_api_key: 'ai_fal_api_key_clear',
  ai_tencent_api_key: 'ai_tencent_api_key_clear',
  ai_together_api_key: 'ai_together_api_key_clear',
} as const

export const APP_AI_SETTINGS_KEY = 'ai_app_settings'

const PUBLIC_ENVIRONMENT_KEYS = new Set([
  'service_display_name',
  'ai_openai_api_key_configured',
  'ai_openai_model',
  'ai_openai_base_url',
  'ai_fal_api_key_configured',
  'ai_fal_base_url',
  'ai_fal_models',
  'ai_fal_claude_model',
  'ai_fal_grok_model',
  'ai_fal_perplexity_model',
  'ai_tencent_api_key_configured',
  'ai_tencent_base_url',
  'ai_tencent_models',
  'ai_together_api_key_configured',
  'ai_together_base_url',
  'ai_together_stt_model',
  'ai_together_summary_model',
  APP_AI_SETTINGS_KEY,
])

type EnvRecord = Record<string, unknown>

function isRecord(value: unknown): value is EnvRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function isPlaceholderSecret(value: unknown): boolean {
  if (typeof value !== 'string') return true
  const trimmed = value.trim()
  if (!trimmed) return true
  return trimmed.includes('...')
}

function publicizeProviderFields(source: EnvRecord): EnvRecord {
  const next = { ...source }
  for (const key of SECRET_ENV_KEYS) {
    const raw = next[key]
    const configured = typeof raw === 'string' && raw.trim().length > 0 && !raw.includes('...')
    delete next[key]
    delete next[SECRET_CLEAR_FLAGS[key]]
    next[SECRET_CONFIGURED_FLAGS[key]] = configured
  }
  return next
}

export function publicEnvironmentData(data: unknown): EnvRecord {
  const source = isRecord(data) ? { ...data } : {}
  const publicized = publicizeProviderFields(source)
  const safeData = Object.fromEntries(
    Object.entries(publicized).filter(([key]) => PUBLIC_ENVIRONMENT_KEYS.has(key)),
  )
  const appSettings = source[APP_AI_SETTINGS_KEY]
  if (isRecord(appSettings)) {
    safeData[APP_AI_SETTINGS_KEY] = Object.fromEntries(
      Object.entries(appSettings).map(([appId, value]) => [
        appId,
        Object.fromEntries(
          Object.entries(publicizeProviderFields(isRecord(value) ? value : {}))
            .filter(([key]) => PUBLIC_ENVIRONMENT_KEYS.has(key)),
        ),
      ]),
    )
  }
  return safeData
}

/** Only settings needed by approved members' apps; omits admin notes, webhooks, and unknown fields. */
export function publicMemberEnvironmentData(data: unknown): EnvRecord {
  return publicEnvironmentData(data)
}

function mergeProviderSecrets(current: EnvRecord, next: EnvRecord): EnvRecord {
  const merged: EnvRecord = { ...current, ...next }
  for (const flag of Object.values(SECRET_CONFIGURED_FLAGS)) {
    delete merged[flag]
  }

  for (const key of SECRET_ENV_KEYS) {
    const clearFlag = SECRET_CLEAR_FLAGS[key]
    delete merged[clearFlag]
    if (next[clearFlag] === true) {
      delete merged[key]
      continue
    }
    const incomingHasKey = Object.prototype.hasOwnProperty.call(next, key)
    if (!incomingHasKey || isPlaceholderSecret(next[key])) {
      if (typeof current[key] === 'string' && current[key].trim()) {
        merged[key] = current[key]
      } else {
        delete merged[key]
      }
    }
  }

  return merged
}

export function mergeEnvironmentConfig(existing: unknown, incoming: unknown): EnvRecord {
  const current = isRecord(existing) ? { ...existing } : {}
  const next = isRecord(incoming) ? { ...incoming } : {}
  const merged = mergeProviderSecrets(current, next)

  if (Object.prototype.hasOwnProperty.call(next, APP_AI_SETTINGS_KEY)) {
    const currentApps = isRecord(current[APP_AI_SETTINGS_KEY]) ? current[APP_AI_SETTINGS_KEY] : {}
    const nextApps = isRecord(next[APP_AI_SETTINGS_KEY]) ? next[APP_AI_SETTINGS_KEY] : {}
    const mergedApps: EnvRecord = { ...currentApps }
    for (const [appId, value] of Object.entries(nextApps)) {
      mergedApps[appId] = mergeProviderSecrets(
        isRecord(currentApps[appId]) ? currentApps[appId] : {},
        isRecord(value) ? value : {},
      )
    }
    merged[APP_AI_SETTINGS_KEY] = mergedApps
  }

  return merged
}
