export type FalAiModelConfig = {
  id: string
  label: string
  provider: 'claude' | 'grok' | 'perplexity' | 'image' | 'custom'
  endpointId: string
}

/** Per-app or legacy global AI provider fields stored in environment_config.data */
export type AppAiSettings = {
  ai_openai_api_key?: string
  ai_openai_api_key_configured?: boolean
  ai_openai_api_key_clear?: boolean
  ai_openai_model?: string
  ai_openai_base_url?: string
  ai_fal_api_key?: string
  ai_fal_api_key_configured?: boolean
  ai_fal_api_key_clear?: boolean
  ai_fal_base_url?: string
  ai_fal_models?: FalAiModelConfig[]
  ai_fal_claude_model?: string
  ai_fal_grok_model?: string
  ai_fal_perplexity_model?: string
  ai_tencent_api_key?: string
  ai_tencent_api_key_configured?: boolean
  ai_tencent_api_key_clear?: boolean
  ai_tencent_base_url?: string
  ai_tencent_models?: Array<{
    id: string
    label: string
    provider: 'openai' | 'gemini' | 'claude' | 'grok' | 'deepseek' | 'glm' | 'kimi' | 'minimax'
    protocol: 'completions' | 'responses' | 'messages'
    apiUrl: string
    enabled: boolean
  }>
}

/** Supabase `environment_config.data` JSON 스키마 */
export type EnvironmentPublicConfig = AppAiSettings & {
  service_display_name?: string
  support_email?: string
  public_api_base_url?: string
  integrations_webhook_url?: string
  admin_notes?: string
  ai_app_settings?: Record<string, AppAiSettings>
}
