import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { getAiHubSession } from './supabaseMembership'
import type { AuthSession } from './types'
import { supabase } from '../lib/supabase'
import {
  getPortalScopedSessionItem,
  removePortalScopedSessionItem,
  setPortalScopedSessionItem,
} from '../lib/portalStorage'
import { withTimeout } from '../lib/withTimeout'

const SUPABASE_INIT_TIMEOUT_MS = 12_000

export type { AuthSession, UserRole } from './types'

const STORAGE_KEY = 'ai-hub-auth'

const listeners = new Set<() => void>()
let cachedRawSession: string | null | undefined
let cachedSession: AuthSession | null = null

function readSession(): AuthSession | null {
  try {
    const raw = getPortalScopedSessionItem(STORAGE_KEY)
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
    }
    return cachedSession
  } catch {
    cachedSession = null
    return null
  }
}

function writeSession(session: AuthSession | null) {
  if (session) {
    const raw = JSON.stringify(session)
    cachedRawSession = raw
    cachedSession = session
    setPortalScopedSessionItem(STORAGE_KEY, raw)
  } else {
    cachedRawSession = null
    cachedSession = null
    removePortalScopedSessionItem(STORAGE_KEY)
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
    const next = await getAiHubSession()
    writeSession(next && next.status === 'approved' ? next : null)
    return next
  }, [])

  useEffect(() => {
    if (!supabase) return
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === 'SIGNED_OUT') {
        writeSession(null)
        return
      }
      if (sess?.user) {
        void refreshSession().catch(() => writeSession(null))
      }
    })

    void withTimeout(supabase.auth.getSession(), SUPABASE_INIT_TIMEOUT_MS)
      .then(({ data: { session: s } }) => {
        if (s?.user) void refreshSession().catch(() => writeSession(null))
      })
      .catch(() => {
        /* Keep the current client session if Supabase init times out. */
      })

    return () => sub.subscription.unsubscribe()
  }, [refreshSession])

  const login = useCallback((next: AuthSession) => {
    writeSession(next)
  }, [])

  const logout = useCallback(() => {
    writeSession(null)
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
