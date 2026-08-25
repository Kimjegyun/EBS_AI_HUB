// Stores browser-local AI provider settings (model/base URL only).
// API keys stay on the server and are used through the AI gateway.
import {
  getPortalMode,
  getPortalScopedItem,
  removePortalScopedItem,
  setPortalScopedItem,
} from './portalStorage'
import { getCurrentAuthSession } from './userScopedStorage'

export type AiSettings = {
  apiKey: string
  model: string
  baseUrl: string
}

export type FalAiSettings = {
  apiKey: string
  baseUrl: string
  models: FalModelEndpoint[]
  claudeModel: string
  grokModel: string
  perplexityModel: string
}

export type FalModelEndpoint = {
  id: string
  label: string
  provider: 'claude' | 'grok' | 'perplexity' | 'image' | 'custom'
  endpointId: string
}

const OPENAI_STORAGE_KEY = 'ai-hub-openai-settings-v1'
const FAL_STORAGE_KEY = 'ai-hub-fal-settings-v1'
const ORG_OPENAI_STORAGE_KEY = 'ai-hub-org-openai-settings-v1'
const ORG_FAL_STORAGE_KEY = 'ai-hub-org-fal-settings-v1'
const OPENAI_CONFIGURED_FLAG = 'ai-hub-openai-configured-v1'
const FAL_CONFIGURED_FLAG = 'ai-hub-fal-configured-v1'
const ORG_OPENAI_BY_APP_KEY = 'ai-hub-org-openai-settings-by-app-v1'
const ORG_FAL_BY_APP_KEY = 'ai-hub-org-fal-settings-by-app-v1'
const OPENAI_CONFIGURED_BY_APP_KEY = 'ai-hub-openai-configured-by-app-v1'
const FAL_CONFIGURED_BY_APP_KEY = 'ai-hub-fal-configured-by-app-v1'

export const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
export const DEFAULT_MODEL = 'gpt-5.6-luna'

export const DEFAULT_FAL_BASE_URL = 'https://queue.fal.run'
export const DEFAULT_FAL_CLAUDE_MODEL = 'anthropic/claude'
export const DEFAULT_FAL_GROK_MODEL = 'xai/grok'
export const DEFAULT_FAL_PERPLEXITY_MODEL = 'perplexity/sonar'

export const AI_MODEL_OPTIONS = [
  'gpt-5.6',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4o-mini',
  'gpt-4o',
  'o4-mini',
  'o3',
  'o3-mini',
]

export const FAL_MODEL_OPTIONS = {
  claude: [
    DEFAULT_FAL_CLAUDE_MODEL,
    'anthropic/claude-3.5-sonnet',
    'anthropic/claude-3-opus',
  ],
  grok: [DEFAULT_FAL_GROK_MODEL, 'xai/grok-4', 'xai/grok-3'],
  perplexity: [DEFAULT_FAL_PERPLEXITY_MODEL, 'perplexity/sonar-pro', 'perplexity/sonar-reasoning'],
}

export const DEFAULT_FAL_MODELS: FalModelEndpoint[] = [
  { id: 'claude-default', label: 'Claude', provider: 'claude', endpointId: DEFAULT_FAL_CLAUDE_MODEL },
  { id: 'grok-default', label: 'Grok', provider: 'grok', endpointId: DEFAULT_FAL_GROK_MODEL },
  {
    id: 'perplexity-default',
    label: 'Perplexity',
    provider: 'perplexity',
    endpointId: DEFAULT_FAL_PERPLEXITY_MODEL,
  },
]

type Listener = () => void
const listeners = new Set<Listener>()

export function subscribeAiSettings(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify(): void {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch (err) {
      console.error('ai settings listener failed:', err)
    }
  })
}

function parseAiSettings(raw: string | null): AiSettings | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<AiSettings>
    return {
      apiKey: parsed.apiKey ?? '',
      model: parsed.model || DEFAULT_MODEL,
      baseUrl: parsed.baseUrl || DEFAULT_BASE_URL,
    }
  } catch (err) {
    console.error('Failed to load OpenAI settings:', err)
    return null
  }
}

function normalizeAiSettings(settings: AiSettings): AiSettings {
  return {
    apiKey: settings.apiKey.trim(),
    model: settings.model.trim() || DEFAULT_MODEL,
    baseUrl: settings.baseUrl.trim().replace(/\/+$/, '') || DEFAULT_BASE_URL,
  }
}

function persistWithoutSecrets(settings: AiSettings): AiSettings {
  return {
    apiKey: '',
    model: settings.model.trim() || DEFAULT_MODEL,
    baseUrl: settings.baseUrl.trim().replace(/\/+$/, '') || DEFAULT_BASE_URL,
  }
}

function readJsonMap<T>(key: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, T>
      : {}
  } catch {
    return {}
  }
}

function writeJsonMap<T>(key: string, value: Record<string, T>): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function readFlagMap(key: string): Record<string, boolean> {
  return readJsonMap<boolean>(key)
}

function setFlagForApp(storageKey: string, configured: boolean, appId: string): void {
  const map = readFlagMap(storageKey)
  if (configured) map[appId] = true
  else delete map[appId]
  writeJsonMap(storageKey, map)
}

function getGlobalAiSettings(): AiSettings {
  const orgSettings = parseAiSettings(localStorage.getItem(ORG_OPENAI_STORAGE_KEY))
  const portalSettings = parseAiSettings(getPortalScopedItem(OPENAI_STORAGE_KEY))
  const merged = getPortalMode() === 'user'
    ? orgSettings ?? portalSettings
    : portalSettings ?? orgSettings
  const clean = persistWithoutSecrets(merged ?? { apiKey: '', model: DEFAULT_MODEL, baseUrl: DEFAULT_BASE_URL })
  if (orgSettings?.apiKey) {
    localStorage.setItem(ORG_OPENAI_STORAGE_KEY, JSON.stringify(persistWithoutSecrets(orgSettings)))
  }
  if (portalSettings?.apiKey) {
    setPortalScopedItem(OPENAI_STORAGE_KEY, JSON.stringify(persistWithoutSecrets(portalSettings)))
  }
  return clean
}

export function getAiSettings(appId?: string): AiSettings {
  if (appId) {
    const stored = readJsonMap<AiSettings>(ORG_OPENAI_BY_APP_KEY)[appId]
    const byApp = stored
      ? persistWithoutSecrets({
          apiKey: stored.apiKey ?? '',
          model: stored.model || DEFAULT_MODEL,
          baseUrl: stored.baseUrl || DEFAULT_BASE_URL,
        })
      : parseAiSettings(getPortalScopedItem(`${OPENAI_STORAGE_KEY}:${appId}`))
    if (byApp) return persistWithoutSecrets(byApp)
  }
  return getGlobalAiSettings()
}

export function saveAiSettings(settings: AiSettings, appId?: string): void {
  const normalized = persistWithoutSecrets(normalizeAiSettings(settings))
  if (appId) {
    const map = readJsonMap<AiSettings>(ORG_OPENAI_BY_APP_KEY)
    map[appId] = normalized
    writeJsonMap(ORG_OPENAI_BY_APP_KEY, map)
    setPortalScopedItem(`${OPENAI_STORAGE_KEY}:${appId}`, JSON.stringify(normalized))
    notify()
    return
  }
  setPortalScopedItem(OPENAI_STORAGE_KEY, JSON.stringify(normalized))
  if (getPortalMode() === 'admin') {
    localStorage.setItem(ORG_OPENAI_STORAGE_KEY, JSON.stringify(normalized))
  }
  notify()
}

export function clearAiSettings(appId?: string): void {
  if (appId) {
    const map = readJsonMap<AiSettings>(ORG_OPENAI_BY_APP_KEY)
    delete map[appId]
    writeJsonMap(ORG_OPENAI_BY_APP_KEY, map)
    removePortalScopedItem(`${OPENAI_STORAGE_KEY}:${appId}`)
    setFlagForApp(OPENAI_CONFIGURED_BY_APP_KEY, false, appId)
    notify()
    return
  }
  removePortalScopedItem(OPENAI_STORAGE_KEY)
  if (getPortalMode() === 'admin') {
    localStorage.removeItem(ORG_OPENAI_STORAGE_KEY)
  }
  notify()
}

export function setOpenAiConfiguredFlag(configured: boolean, appId?: string): void {
  if (appId) {
    setFlagForApp(OPENAI_CONFIGURED_BY_APP_KEY, configured, appId)
    notify()
    return
  }
  if (configured) localStorage.setItem(OPENAI_CONFIGURED_FLAG, '1')
  else localStorage.removeItem(OPENAI_CONFIGURED_FLAG)
  notify()
}

export function setFalConfiguredFlag(configured: boolean, appId?: string): void {
  if (appId) {
    setFlagForApp(FAL_CONFIGURED_BY_APP_KEY, configured, appId)
    notify()
    return
  }
  if (configured) localStorage.setItem(FAL_CONFIGURED_FLAG, '1')
  else localStorage.removeItem(FAL_CONFIGURED_FLAG)
  notify()
}

export function isAiConfigured(appId?: string): boolean {
  if (getCurrentAuthSession()?.role === 'user') return true
  if (appId && readFlagMap(OPENAI_CONFIGURED_BY_APP_KEY)[appId]) return true
  return localStorage.getItem(OPENAI_CONFIGURED_FLAG) === '1'
}

export function isFalAiConfigured(appId?: string): boolean {
  if (getCurrentAuthSession()?.role === 'user') return true
  if (appId && readFlagMap(FAL_CONFIGURED_BY_APP_KEY)[appId]) return true
  return localStorage.getItem(FAL_CONFIGURED_FLAG) === '1'
}

function parseFalAiSettings(raw: string | null): FalAiSettings | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<FalAiSettings>
    const legacyModels: FalModelEndpoint[] = [
      {
        id: 'claude-default',
        label: 'Claude',
        provider: 'claude',
        endpointId: parsed.claudeModel || DEFAULT_FAL_CLAUDE_MODEL,
      },
      {
        id: 'grok-default',
        label: 'Grok',
        provider: 'grok',
        endpointId: parsed.grokModel || DEFAULT_FAL_GROK_MODEL,
      },
      {
        id: 'perplexity-default',
        label: 'Perplexity',
        provider: 'perplexity',
        endpointId: parsed.perplexityModel || DEFAULT_FAL_PERPLEXITY_MODEL,
      },
    ]
    const models = Array.isArray(parsed.models) && parsed.models.length > 0
      ? parsed.models
          .filter((model) => model && typeof model === 'object')
          .map((model, index) => ({
            id: String(model.id || `fal-model-${index}`),
            label: String(model.label || model.endpointId || `Model ${index + 1}`),
            provider: model.provider || 'custom',
            endpointId: String(model.endpointId || ''),
          }))
          .filter((model) => model.endpointId)
      : legacyModels
    return {
      apiKey: parsed.apiKey ?? '',
      baseUrl: parsed.baseUrl || DEFAULT_FAL_BASE_URL,
      models,
      claudeModel: parsed.claudeModel || DEFAULT_FAL_CLAUDE_MODEL,
      grokModel: parsed.grokModel || DEFAULT_FAL_GROK_MODEL,
      perplexityModel: parsed.perplexityModel || DEFAULT_FAL_PERPLEXITY_MODEL,
    }
  } catch (err) {
    console.error('Failed to load fal.ai settings:', err)
    return null
  }
}

function defaultFalSettings(): FalAiSettings {
  return {
    apiKey: '',
    baseUrl: DEFAULT_FAL_BASE_URL,
    models: DEFAULT_FAL_MODELS,
    claudeModel: DEFAULT_FAL_CLAUDE_MODEL,
    grokModel: DEFAULT_FAL_GROK_MODEL,
    perplexityModel: DEFAULT_FAL_PERPLEXITY_MODEL,
  }
}

function persistFalWithoutSecrets(settings: FalAiSettings): FalAiSettings {
  return { ...settings, apiKey: '' }
}

function getGlobalFalAiSettings(): FalAiSettings {
  const orgSettings = parseFalAiSettings(localStorage.getItem(ORG_FAL_STORAGE_KEY))
  const portalSettings = parseFalAiSettings(getPortalScopedItem(FAL_STORAGE_KEY))
  const merged = getPortalMode() === 'user'
    ? orgSettings ?? portalSettings
    : portalSettings ?? orgSettings
  if (orgSettings?.apiKey) {
    localStorage.setItem(ORG_FAL_STORAGE_KEY, JSON.stringify(persistFalWithoutSecrets(orgSettings)))
  }
  if (portalSettings?.apiKey) {
    setPortalScopedItem(FAL_STORAGE_KEY, JSON.stringify(persistFalWithoutSecrets(portalSettings)))
  }
  return persistFalWithoutSecrets(merged ?? defaultFalSettings())
}

export function getFalAiSettings(appId?: string): FalAiSettings {
  if (appId) {
    const stored = readJsonMap<FalAiSettings>(ORG_FAL_BY_APP_KEY)[appId]
    const byApp = stored
      ? persistFalWithoutSecrets(stored)
      : parseFalAiSettings(getPortalScopedItem(`${FAL_STORAGE_KEY}:${appId}`))
    if (byApp) return persistFalWithoutSecrets(byApp)
  }
  return getGlobalFalAiSettings()
}

function normalizeFalAiSettings(settings: FalAiSettings): FalAiSettings {
  const models = (settings.models.length > 0 ? settings.models : DEFAULT_FAL_MODELS)
    .map((model, index) => ({
      id: model.id.trim() || `fal-model-${index}`,
      label: model.label.trim() || model.endpointId.trim() || `Model ${index + 1}`,
      provider: model.provider || 'custom',
      endpointId: model.endpointId.trim(),
    }))
    .filter((model) => model.endpointId)
  return persistFalWithoutSecrets({
    apiKey: '',
    baseUrl: settings.baseUrl.trim().replace(/\/+$/, '') || DEFAULT_FAL_BASE_URL,
    models,
    claudeModel:
      models.find((model) => model.provider === 'claude')?.endpointId ||
      settings.claudeModel.trim() ||
      DEFAULT_FAL_CLAUDE_MODEL,
    grokModel:
      models.find((model) => model.provider === 'grok')?.endpointId ||
      settings.grokModel.trim() ||
      DEFAULT_FAL_GROK_MODEL,
    perplexityModel:
      models.find((model) => model.provider === 'perplexity')?.endpointId ||
      settings.perplexityModel.trim() ||
      DEFAULT_FAL_PERPLEXITY_MODEL,
  })
}

export function saveFalAiSettings(settings: FalAiSettings, appId?: string): void {
  const normalized = normalizeFalAiSettings(settings)
  if (appId) {
    const map = readJsonMap<FalAiSettings>(ORG_FAL_BY_APP_KEY)
    map[appId] = normalized
    writeJsonMap(ORG_FAL_BY_APP_KEY, map)
    setPortalScopedItem(`${FAL_STORAGE_KEY}:${appId}`, JSON.stringify(normalized))
    notify()
    return
  }
  setPortalScopedItem(FAL_STORAGE_KEY, JSON.stringify(normalized))
  if (getPortalMode() === 'admin') {
    localStorage.setItem(ORG_FAL_STORAGE_KEY, JSON.stringify(normalized))
  }
  notify()
}

export function clearFalAiSettings(appId?: string): void {
  if (appId) {
    const map = readJsonMap<FalAiSettings>(ORG_FAL_BY_APP_KEY)
    delete map[appId]
    writeJsonMap(ORG_FAL_BY_APP_KEY, map)
    removePortalScopedItem(`${FAL_STORAGE_KEY}:${appId}`)
    setFlagForApp(FAL_CONFIGURED_BY_APP_KEY, false, appId)
    notify()
    return
  }
  removePortalScopedItem(FAL_STORAGE_KEY)
  if (getPortalMode() === 'admin') {
    localStorage.removeItem(ORG_FAL_STORAGE_KEY)
  }
  notify()
}

export function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 10) return `${key.slice(0, 2)}...`
  return `${key.slice(0, 5)}...${key.slice(-4)}`
}
