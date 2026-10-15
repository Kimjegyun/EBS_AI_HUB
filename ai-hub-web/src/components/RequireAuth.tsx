import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { syncAccountSettings } from '../lib/settingsSync'

type Props = { children: ReactNode }

/** Longest the first screen waits for the account's settings before using this device's copy. */
const INITIAL_SYNC_TIMEOUT_MS = 4000

export default function RequireAuth({ children }: Props) {
  const { session } = useAuth()
  const location = useLocation()
  const approved = !!session && (!session.status || session.status === 'approved')
  const account = approved ? (session.userId || session.email) : ''
  const [syncedAccount, setSyncedAccount] = useState('')

  // Pull the account's settings (apps, layout, notes, ...) before pages read them,
  // so a new PC or phone starts from the same environment instead of defaults.
  useEffect(() => {
    if (!account) return
    let active = true
    const done = () => { if (active) setSyncedAccount(account) }
    const timer = setTimeout(done, INITIAL_SYNC_TIMEOUT_MS)
    void syncAccountSettings().catch(() => []).finally(() => { clearTimeout(timer); done() })
    const onVisible = () => { if (document.visibilityState === 'visible') void syncAccountSettings().catch(() => []) }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      active = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [account])

  if (!approved) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (syncedAccount !== account) {
    return (
      <div className="min-h-screen flex items-center justify-center text-on-surface-variant text-body-sm" role="status">
        계정 환경을 불러오는 중…
      </div>
    )
  }

  return <>{children}</>
}
