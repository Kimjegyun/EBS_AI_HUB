import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchEnvironmentConfig } from '../lib/environmentConfig'
import { applyEnvironmentAiConfig } from '../lib/appAiConfig'
import { isSupabaseConfigured } from '../lib/supabase'
import type { EnvironmentPublicConfig } from '../types/environment'

type EnvironmentConfigState = {
  config: EnvironmentPublicConfig
  updatedAt: string | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  supabaseReady: boolean
}

const EnvironmentConfigContext = createContext<EnvironmentConfigState | null>(null)

export function EnvironmentConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<EnvironmentPublicConfig>({})
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabaseReady = isSupabaseConfigured()

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetchEnvironmentConfig()
    setLoading(false)
    if (res.error) {
      setError(res.error.message)
      setConfig({})
      setUpdatedAt(null)
      return
    }
    setConfig(res.config)
    setUpdatedAt(res.updatedAt)
    applyEnvironmentAiConfig(res.config)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const value = useMemo(
    () => ({
      config,
      updatedAt,
      loading,
      error,
      refetch,
      supabaseReady,
    }),
    [config, updatedAt, loading, error, refetch, supabaseReady],
  )

  return (
    <EnvironmentConfigContext.Provider value={value}>
      {children}
    </EnvironmentConfigContext.Provider>
  )
}

export function useEnvironmentConfig() {
  const ctx = useContext(EnvironmentConfigContext)
  if (!ctx) {
    throw new Error('useEnvironmentConfig는 EnvironmentConfigProvider 안에서만 사용할 수 있습니다.')
  }
  return ctx
}
