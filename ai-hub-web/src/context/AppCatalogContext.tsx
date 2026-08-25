import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/AuthContext'
import {
  fetchPublishedApps,
  readPublishedAppsCache,
  setAppPublished,
} from '../lib/appPublicationService'
import {
  catalogApps,
  canUserSelectApp,
  filterUsableAppIds,
  resolveActiveAppIds,
  resolveInstalledAppIds,
} from '../apps/appAccess'
import { installApp, setActiveApps, uninstallApp } from '../apps/registry'
import type { AppPlugin } from '../apps/types'

type AppCatalogValue = {
  publishedIds: string[]
  loading: boolean
  error: string | null
  catalog: AppPlugin[]
  installedIds: string[]
  activeIds: string[]
  isPublished: (appId: string) => boolean
  refresh: () => Promise<void>
  publishApp: (appId: string) => Promise<void>
  unpublishApp: (appId: string) => Promise<void>
  selectApp: (appId: string, selected: boolean) => void
  setAppActive: (appId: string, active: boolean) => void
  replaceActiveApps: (ids: string[]) => void
}

const AppCatalogContext = createContext<AppCatalogValue | null>(null)

export function AppCatalogProvider({ children }: { children: ReactNode }) {
  const { isAdmin, session } = useAuth()
  const [publishedIds, setPublishedIds] = useState<string[]>(() => readPublishedAppsCache())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectionVersion, setSelectionVersion] = useState(0)

  const refresh = useCallback(async () => {
    if (!session) {
      setPublishedIds([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setPublishedIds(await fetchPublishedApps())
    } catch (err) {
      setError(err instanceof Error ? err.message : '앱 등록 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!session) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [session, refresh])

  const publishApp = useCallback(async (appId: string) => {
    await setAppPublished(appId, true)
    setPublishedIds(await fetchPublishedApps())
  }, [])

  const unpublishApp = useCallback(async (appId: string) => {
    await setAppPublished(appId, false)
    setPublishedIds(await fetchPublishedApps())
  }, [])

  const selectApp = useCallback((appId: string, selected: boolean) => {
    if (selected) {
      if (!canUserSelectApp(appId, isAdmin, publishedIds)) return
      installApp(appId)
      const nextActive = resolveActiveAppIds(isAdmin, publishedIds)
      if (!nextActive.includes(appId)) setActiveApps([...nextActive, appId])
    } else {
      uninstallApp(appId)
    }
    setSelectionVersion((value) => value + 1)
  }, [isAdmin, publishedIds])

  const setAppActive = useCallback((appId: string, active: boolean) => {
    if (active && !canUserSelectApp(appId, isAdmin, publishedIds)) return
    const current = resolveActiveAppIds(isAdmin, publishedIds)
    const next = active
      ? (current.includes(appId) ? current : [...current, appId])
      : current.filter((id) => id !== appId)
    setActiveApps(next)
    setSelectionVersion((value) => value + 1)
  }, [isAdmin, publishedIds])

  const replaceActiveApps = useCallback((ids: string[]) => {
    setActiveApps(filterUsableAppIds(ids, isAdmin, publishedIds))
    setSelectionVersion((value) => value + 1)
  }, [isAdmin, publishedIds])

  const catalog = useMemo(() => catalogApps(isAdmin, publishedIds), [isAdmin, publishedIds])
  const installedIds = useMemo(
    () => {
      void selectionVersion
      return resolveInstalledAppIds(isAdmin, publishedIds)
    },
    [isAdmin, publishedIds, selectionVersion],
  )
  const activeIds = useMemo(
    () => {
      void selectionVersion
      return resolveActiveAppIds(isAdmin, publishedIds)
    },
    [isAdmin, publishedIds, selectionVersion],
  )

  const value = useMemo<AppCatalogValue>(
    () => ({
      publishedIds,
      loading,
      error,
      catalog,
      installedIds,
      activeIds,
      isPublished: (appId: string) => publishedIds.includes(appId),
      refresh,
      publishApp,
      unpublishApp,
      selectApp,
      setAppActive,
      replaceActiveApps,
    }),
    [
      activeIds,
      catalog,
      error,
      installedIds,
      loading,
      publishApp,
      publishedIds,
      refresh,
      replaceActiveApps,
      selectApp,
      setAppActive,
      unpublishApp,
    ],
  )

  return <AppCatalogContext.Provider value={value}>{children}</AppCatalogContext.Provider>
}

export function useAppCatalog() {
  const ctx = useContext(AppCatalogContext)
  if (!ctx) {
    throw new Error('useAppCatalog은 AppCatalogProvider 안에서만 사용할 수 있습니다.')
  }
  return ctx
}
