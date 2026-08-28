import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import {
  getRemoteApps,
  installApp,
  setActiveApps,
  subscribeRegistry,
  setRemoteApps,
  uninstallApp,
} from '../apps/registry'
import { loadAllRemoteApps, PREVIEW_PREFIX, type RemoteAppLoadResult } from '../apps/remoteApps'
import type { AppPlugin } from '../apps/types'

type AppCatalogValue = {
  publishedIds: string[]
  /** 마켓플레이스에서 불러온 원격 앱의 로드 결과 (실패 사유 포함) */
  remoteApps: RemoteAppLoadResult[]
  remoteLoading: boolean
  reloadRemoteApps: () => Promise<void>
  /** 제출 전 로컬 파일을 그 자리에서 띄워 보는 슬롯. 나만 보이고 새로고침하면 사라진다. */
  previewApp: RemoteAppLoadResult | null
  setPreviewApp: (result: RemoteAppLoadResult | null) => void
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
  const [remoteApps, setRemoteAppResults] = useState<RemoteAppLoadResult[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [previewApp, setPreviewAppState] = useState<RemoteAppLoadResult | null>(null)
  // 레지스트리가 바뀌면(원격 앱 로드) 목록을 다시 계산하게 만드는 카운터
  const [registryVersion, setRegistryVersion] = useState(0)

  useEffect(() => subscribeRegistry(() => setRegistryVersion((v) => v + 1)), [])

  // 목록을 다시 불러올 때 미리보기가 날아가지 않게 따로 들고 있는다.
  const previewPluginRef = useRef<AppPlugin | null>(null)

  /** 마켓플레이스에 등록된 원격 앱을 내려받아 레지스트리에 반영한다. */
  const reloadRemoteApps = useCallback(async () => {
    if (!session) {
      setRemoteAppResults([])
      setRemoteApps([])
      return
    }
    setRemoteLoading(true)
    try {
      const results = await loadAllRemoteApps()
      setRemoteAppResults(results)
      // 로드에 성공한 앱만 레지스트리에 넣는다. 실패한 앱은 목록에만 남겨 관리자가 본다.
      // 미리보기 중인 앱이 있으면 함께 유지한다 — 목록을 새로 고쳐도 사라지지 않게.
      setRemoteApps([
        ...results.flatMap((r) => (r.plugin ? [r.plugin] : [])),
        ...(previewPluginRef.current ? [previewPluginRef.current] : []),
      ])
    } finally {
      setRemoteLoading(false)
    }
  }, [session])

  /**
   * 로컬 미리보기 슬롯을 채우거나 비운다.
   *
   * 서버를 거치지 않고 레지스트리에만 얹는다. 승인 절차를 우회하는 것이 아니라,
   * 제출하기 전에 만든 사람이 자기 화면에서 확인하는 용도다.
   */
  const setPreviewApp = useCallback((result: RemoteAppLoadResult | null) => {
    previewPluginRef.current = result?.plugin ?? null
    setPreviewAppState(result)
    setRemoteApps([
      ...getRemoteApps().filter((a) => !a.id.startsWith(PREVIEW_PREFIX)),
      ...(result?.plugin ? [result.plugin] : []),
    ])
  }, [])

  // setState는 모두 await 이후에 일어나지만 규칙이 호출을 따라 들어가 오탐합니다.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reloadRemoteApps() }, [reloadRemoteApps])

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

  const catalog = useMemo(
    () => { void registryVersion; return catalogApps(isAdmin, publishedIds) },
    [isAdmin, publishedIds, registryVersion],
  )
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
      remoteApps,
      remoteLoading,
      reloadRemoteApps,
      previewApp,
      setPreviewApp,
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
      remoteApps,
      remoteLoading,
      reloadRemoteApps,
      previewApp,
      setPreviewApp,
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
