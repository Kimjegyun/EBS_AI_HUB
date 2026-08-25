const APP_AI_SETTINGS_KEY = 'ai_app_settings'

type EnvRecord = Record<string, unknown>

function isRecord(value: unknown): value is EnvRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function pick(appConfig: EnvRecord, globalConfig: EnvRecord, key: string): string {
  return asString(appConfig[key]) || asString(globalConfig[key])
}

/** App-specific AI fields win; missing values fall back to the legacy global config. */
export function resolveProviderConfig(env: Record<string, unknown>, appId?: string): Record<string, unknown> {
  const apps = isRecord(env[APP_AI_SETTINGS_KEY]) ? env[APP_AI_SETTINGS_KEY] : {}
  const appConfig = appId && isRecord(apps[appId]) ? apps[appId] : {}
  const falModels = Array.isArray(appConfig.ai_fal_models) && appConfig.ai_fal_models.length > 0
    ? appConfig.ai_fal_models
    : env.ai_fal_models

  return {
    ...env,
    ...appConfig,
    ai_openai_api_key: pick(appConfig, env, 'ai_openai_api_key'),
    ai_openai_model: pick(appConfig, env, 'ai_openai_model'),
    ai_openai_base_url: pick(appConfig, env, 'ai_openai_base_url'),
    ai_fal_api_key: pick(appConfig, env, 'ai_fal_api_key'),
    ai_fal_base_url: pick(appConfig, env, 'ai_fal_base_url'),
    ai_fal_claude_model: pick(appConfig, env, 'ai_fal_claude_model'),
    ai_fal_grok_model: pick(appConfig, env, 'ai_fal_grok_model'),
    ai_fal_perplexity_model: pick(appConfig, env, 'ai_fal_perplexity_model'),
    ai_fal_models: falModels,
    ai_tencent_api_key: pick(appConfig, env, 'ai_tencent_api_key'),
    ai_tencent_base_url: pick(appConfig, env, 'ai_tencent_base_url'),
    ai_tencent_models:
      Array.isArray(appConfig.ai_tencent_models) && appConfig.ai_tencent_models.length > 0
        ? appConfig.ai_tencent_models
        : env.ai_tencent_models,
  }
}
