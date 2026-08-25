import {
  DEFAULT_TENCENT_BASE_URL,
  enabledTencentModels,
  mergeTencentModels,
  type TencentModelConfig,
} from './tencentCatalog'

const STORAGE_KEY = 'ai-hub-org-tencent-settings-v1'

export type TencentPublicSettings = {
  configured: boolean
  baseUrl: string
  models: TencentModelConfig[]
}

type Listener = () => void
const listeners = new Set<Listener>()

export function subscribeTencentSettings(listener: Listener): () => void {
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
      console.error('tencent settings listener failed:', err)
    }
  })
}

function defaultSettings(): TencentPublicSettings {
  return {
    configured: false,
    baseUrl: DEFAULT_TENCENT_BASE_URL,
    models: mergeTencentModels(undefined),
  }
}

export function getTencentSettings(): TencentPublicSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultSettings()
    const parsed = JSON.parse(raw) as Partial<TencentPublicSettings>
    return {
      configured: Boolean(parsed.configured),
      baseUrl: parsed.baseUrl?.trim() || DEFAULT_TENCENT_BASE_URL,
      models: mergeTencentModels(parsed.models),
    }
  } catch {
    return defaultSettings()
  }
}

export function saveTencentPublicSettings(settings: TencentPublicSettings): void {
  const next: TencentPublicSettings = {
    configured: settings.configured,
    baseUrl: settings.baseUrl.trim().replace(/\/+$/, '') || DEFAULT_TENCENT_BASE_URL,
    models: mergeTencentModels(settings.models),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  notify()
}

export function isTencentConfigured(): boolean {
  return getTencentSettings().configured
}

export function findTencentModel(modelId: string): TencentModelConfig | undefined {
  return enabledTencentModels(getTencentSettings().models).find((model) => model.id === modelId)
}
