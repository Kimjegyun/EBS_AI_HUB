import type { EnvironmentPublicConfig } from '../types/environment'
import { getLocalApiBaseUrl } from './localApi'
import { publicEnvironmentData } from './secretFields'
import { supabase } from './supabase'

const LOCAL_ENV_API_URL = `${getLocalApiBaseUrl()}/api/environment`

type FetchResult = {
  config: EnvironmentPublicConfig
  updatedAt: string | null
  error: Error | null
}

function normalizeConfig(raw: unknown): EnvironmentPublicConfig {
  return publicEnvironmentData(raw) as EnvironmentPublicConfig
}

async function fetchLocalEnvironmentConfig(): Promise<FetchResult> {
  try {
    const res = await fetch(LOCAL_ENV_API_URL)
    if (!res.ok) {
      return { config: {}, updatedAt: null, error: new Error(`Local environment API failed: ${res.status}`) }
    }
    const row = await res.json() as { data?: unknown; updated_at?: unknown }
    return {
      config: normalizeConfig(row.data),
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
      error: null,
    }
  } catch (err) {
    return {
      config: {},
      updatedAt: null,
      error: err instanceof Error ? err : new Error('Local environment API unavailable'),
    }
  }
}

async function saveLocalEnvironmentConfig(
  config: EnvironmentPublicConfig,
): Promise<{ error: Error | null }> {
  try {
    const res = await fetch(LOCAL_ENV_API_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: config }),
    })
    if (!res.ok) {
      return { error: new Error(`Local environment API failed: ${res.status}`) }
    }
    return { error: null }
  } catch (err) {
    return {
      error: err instanceof Error ? err : new Error('Local environment API unavailable'),
    }
  }
}

export async function fetchEnvironmentConfig(): Promise<FetchResult> {
  if (!supabase) return fetchLocalEnvironmentConfig()

  const { data, error } = await supabase.rpc('get_ai_hub_environment_config')
  if (error) {
    const fallback = await fetchLocalEnvironmentConfig()
    return fallback.error
      ? { config: {}, updatedAt: null, error: new Error(error.message) }
      : fallback
  }

  const rows = Array.isArray(data) ? data : []
  const row = rows[0] as { data?: unknown; updated_at?: unknown } | undefined
  if (!row) return fetchLocalEnvironmentConfig()

  return {
    config: normalizeConfig(row.data),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
    error: null,
  }
}

export async function saveEnvironmentConfig(
  config: EnvironmentPublicConfig,
): Promise<{ error: Error | null }> {
  // Tencent 호출은 로컬 API만 사용하므로 로컬 저장이 우선이다.
  const local = await saveLocalEnvironmentConfig(config)
  if (local.error) return local
  if (!supabase) return local

  const { error } = await supabase.rpc('save_ai_hub_environment_config', {
    p_data: config,
  })
  if (error) {
    console.warn('cloud environment save failed; local key is stored:', error.message)
  }
  return { error: null }
}
