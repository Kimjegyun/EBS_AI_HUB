import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { isOnResetPasswordPage, isPasswordChangeRequired } from './passwordReset'
import { getAiHubSession } from './supabaseMembership'
import type { AuthSession } from './types'
import { supabase } from '../lib/supabase'
import {
  getPortalScopedItem,
  getPortalScopedSessionItem,
  removePortalScopedItem,
  removePortalScopedSessionItem,
  setPortalScopedItem,
  setPortalScopedSessionItem,
} from '../lib/portalStorage'
import { withTimeout } from '../lib/withTimeout'

const SUPABASE_INIT_TIMEOUT_MS = 12_000

export type { AuthSession, UserRole } from './types'

const STORAGE_KEY = 'ai-hub-auth'

const listeners = new Set<() => void>()
let cachedRawSession: string | null | undefined
let cachedSession: AuthSession | null = null
let sessionRevision = 0

function readSession(): AuthSession | null {
  try {
    const persistentRaw = getPortalScopedItem(STORAGE_KEY)
    const raw = persistentRaw ?? getPortalScopedSessionItem(STORAGE_KEY)
    // 기존 버전의 탭 세션을 한 번 읽으면 영구 저장소로 자동 이전합니다.
    if (!persistentRaw && raw) setPortalScopedItem(STORAGE_KEY, raw)
    if (raw === cachedRawSession) return cachedSession
    cachedRawSession = raw
    if (!raw) {
      cachedSession = null
      return cachedSession
    }
    const data = JSON.parse(raw) as AuthSession
    if (data.role !== 'admin' && data.role !== 'user') {
      cachedSession = null
      return cachedSession
    }
    if (typeof data.email !== 'string' || !data.email) {
      cachedSession = null
      return cachedSession
    }
    cachedSession = {
      userId: typeof data.userId === 'string' ? data.userId : undefined,
      projectId: typeof data.projectId === 'string' ? data.projectId : undefined,
      role: data.role,
      projectRole: data.projectRole,
      status: data.status,
      email: data.email,
      displayName:
        typeof data.displayName === 'string' && data.displayName
        ? data.displayName
        : 'User',
      organization: data.organization ?? null,
      department: data.department,
      contactPhone: data.contactPhone,
    }
    return cachedSession
  } catch {
    cachedSession = null
    return null
  }
}

function writeSession(session: AuthSession | null) {
  sessionRevision++
  if (session) {
    const raw = JSON.stringify(session)
    cachedRawSession = raw
    cachedSession = session
    setPortalScopedSessionItem(STORAGE_KEY, raw)
    setPortalScopedItem(STORAGE_KEY, raw)
  } else {
    cachedRawSession = null
    cachedSession = null
    removePortalScopedSessionItem(STORAGE_KEY)
    removePortalScopedItem(STORAGE_KEY)
  }
  listeners.forEach((l) => l())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function getServerSnapshot(): AuthSession | null {
  return null
}

type AuthContextValue = {
  session: AuthSession | null
  isAdmin: boolean
  login: (session: AuthSession) => void
  refreshSession: () => Promise<AuthSession | null>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribe, readSession, getServerSnapshot)

  const refreshSession = useCallback(async () => {
    if (!supabase) return readSession()
    const revision = sessionRevision
    // A reset link or an admin-issued temporary password signs in to Supabase, but the
    // app stays signed out until the user has chosen a new password on the reset page.
    if (isOnResetPasswordPage()) return null
    const { data: { session: sbSession } } = await supabase.auth.getSession()
    if (isPasswordChangeRequired(sbSession?.user)) {
      if (revision === sessionRevision) writeSession(null)
      return null
    }
    const next = await getAiHubSession()
    // A signup/login or sign-out may have completed while this request was pending.
    if (revision === sessionRevision) writeSession(next && next.status === 'approved' ? next : null)
    return next
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    const scheduleRefresh = () => {
      clearTimeout(refreshTimer)
      // Supabase emits auth events under its auth lock. Defer further SDK calls.
      refreshTimer = setTimeout(() => {
        if (active) void refreshSession().catch(() => { /* A temporary lookup failure must not undo a completed login. */ })
      }, 0)
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === 'SIGNED_OUT') {
        clearTimeout(refreshTimer)
        writeSession(null)
        return
      }
      if (sess?.user) {
        scheduleRefresh()
      }
    })

    void withTimeout(supabase.auth.getSession(), SUPABASE_INIT_TIMEOUT_MS)
      .then(({ data: { session: s } }) => {
        if (active && s?.user) scheduleRefresh()
      })
      .catch(() => {
        /* Keep the current client session if Supabase init times out. */
      })

    return () => { active = false; clearTimeout(refreshTimer); sub.subscription.unsubscribe() }
  }, [refreshSession])

  const login = useCallback((next: AuthSession) => {
    writeSession(next)
  }, [])

  const logout = useCallback(() => {
    writeSession(null)
    removePortalScopedSessionItem('api-admin-token')
    removePortalScopedItem('api-admin-token')
    void supabase?.auth.signOut()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAdmin: session?.role === 'admin',
      login,
      refreshSession,
      logout,
    }),
    [session, login, refreshSession, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider.')
  }
  return ctx
}

/** AuthProvider 없는 환경(standalone PWA)에서도 안전하게 null 반환하는 버전 */
export function useAuthSafe() {
  return useContext(AuthContext)
}
