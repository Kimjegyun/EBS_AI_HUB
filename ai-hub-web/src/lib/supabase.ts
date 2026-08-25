import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  getPortalScopedItem,
  removePortalScopedItem,
  setPortalScopedItem,
} from './portalStorage'

const RUNTIME_SUPABASE_CONFIG_KEY = 'ai-hub-runtime-supabase-config-v1'

export type RuntimeSupabaseConfig = {
  url: string
  anonKey: string
}

function readRuntimeSupabaseConfig(): RuntimeSupabaseConfig | null {
  try {
    const raw = getPortalScopedItem(RUNTIME_SUPABASE_CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<RuntimeSupabaseConfig>
    if (typeof parsed.url !== 'string' || typeof parsed.anonKey !== 'string') return null
    if (!parsed.url.trim() || !parsed.anonKey.trim()) return null
    return {
      url: parsed.url.trim(),
      anonKey: parsed.anonKey.trim(),
    }
  } catch {
    return null
  }
}

export function getRuntimeSupabaseConfig(): RuntimeSupabaseConfig {
  const runtime = readRuntimeSupabaseConfig()
  return {
    url: runtime?.url ?? import.meta.env.VITE_SUPABASE_URL ?? '',
    anonKey: runtime?.anonKey ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  }
}

export function saveRuntimeSupabaseConfig(config: RuntimeSupabaseConfig) {
  setPortalScopedItem(RUNTIME_SUPABASE_CONFIG_KEY, JSON.stringify(config))
}

export function clearRuntimeSupabaseConfig() {
  removePortalScopedItem(RUNTIME_SUPABASE_CONFIG_KEY)
}

export function hasRuntimeSupabaseOverride(): boolean {
  return readRuntimeSupabaseConfig() !== null
}

const { url, anonKey } = getRuntimeSupabaseConfig()

export function isSupabaseConfigured(): boolean {
  return url.length > 0 && anonKey.length > 0
}

export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(url, anonKey)
  : null
