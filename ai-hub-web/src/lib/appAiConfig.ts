import type { AppAiSettings, EnvironmentPublicConfig } from '../types/environment'
import {
  DEFAULT_BASE_URL,
  DEFAULT_FAL_BASE_URL,
  DEFAULT_FAL_CLAUDE_MODEL,
  DEFAULT_FAL_GROK_MODEL,
  DEFAULT_FAL_MODELS,
  DEFAULT_FAL_PERPLEXITY_MODEL,
  DEFAULT_MODEL,
  saveAiSettings,
  saveFalAiSettings,
  setFalConfiguredFlag,
  setOpenAiConfiguredFlag,
  type FalAiSettings,
  type FalModelEndpoint,
} from './aiSettings'
import { DEFAULT_TENCENT_BASE_URL, MY_LLM_APP_ID, mergeTencentModels } from './tencentCatalog'
import { saveTencentPublicSettings } from './tencentSettings'

export function patchAppAiSettings(
  config: EnvironmentPublicConfig,
  appId: string,
  patch: AppAiSettings,
): EnvironmentPublicConfig {
  return {
    ...config,
    ai_app_settings: {
      ...(config.ai_app_settings ?? {}),
      [appId]: {
        ...(config.ai_app_settings?.[appId] ?? {}),
        ...patch,
      },
    },
  }
}

function asFalModels(value: AppAiSettings['ai_fal_models'] | undefined): FalModelEndpoint[] {
  if (!Array.isArray(value) || value.length === 0) return []
  return value
}

function toFalSettings(config: EnvironmentPublicConfig, appId?: string): FalAiSettings {
  const app = appId ? config.ai_app_settings?.[appId] : undefined
  const models = asFalModels(app?.ai_fal_models)
  const globalModels = asFalModels(config.ai_fal_models)
  return {
    apiKey: '',
    baseUrl: app?.ai_fal_base_url || config.ai_fal_base_url || DEFAULT_FAL_BASE_URL,
    models: models.length > 0 ? models : globalModels.length > 0 ? globalModels : DEFAULT_FAL_MODELS,
    claudeModel: app?.ai_fal_claude_model || config.ai_fal_claude_model || DEFAULT_FAL_CLAUDE_MODEL,
    grokModel: app?.ai_fal_grok_model || config.ai_fal_grok_model || DEFAULT_FAL_GROK_MODEL,
    perplexityModel: app?.ai_fal_perplexity_model || config.ai_fal_perplexity_model || DEFAULT_FAL_PERPLEXITY_MODEL,
  }
}

export function applyEnvironmentAiConfig(config: EnvironmentPublicConfig): void {
  if (config.ai_openai_model || config.ai_openai_base_url) {
    saveAiSettings({
      apiKey: '',
      model: config.ai_openai_model || DEFAULT_MODEL,
      baseUrl: config.ai_openai_base_url || DEFAULT_BASE_URL,
    })
  }
  if (config.ai_fal_base_url || config.ai_fal_models?.length) {
    saveFalAiSettings(toFalSettings(config))
  }
  setOpenAiConfiguredFlag(Boolean(config.ai_openai_api_key_configured))
  setFalConfiguredFlag(Boolean(config.ai_fal_api_key_configured))

  for (const appId of Object.keys(config.ai_app_settings ?? {})) {
    const app = config.ai_app_settings?.[appId]
    saveAiSettings({
      apiKey: '',
      model: app?.ai_openai_model || config.ai_openai_model || DEFAULT_MODEL,
      baseUrl: app?.ai_openai_base_url || config.ai_openai_base_url || DEFAULT_BASE_URL,
    }, appId)
    saveFalAiSettings(toFalSettings(config, appId), appId)
    setOpenAiConfiguredFlag(Boolean(app?.ai_openai_api_key_configured), appId)
    setFalConfiguredFlag(Boolean(app?.ai_fal_api_key_configured), appId)
  }

  const tencent = config.ai_app_settings?.[MY_LLM_APP_ID] ?? config
  saveTencentPublicSettings({
    configured: Boolean(tencent.ai_tencent_api_key_configured || config.ai_tencent_api_key_configured),
    baseUrl: tencent.ai_tencent_base_url || config.ai_tencent_base_url || DEFAULT_TENCENT_BASE_URL,
    models: mergeTencentModels(tencent.ai_tencent_models ?? config.ai_tencent_models),
  })
}
