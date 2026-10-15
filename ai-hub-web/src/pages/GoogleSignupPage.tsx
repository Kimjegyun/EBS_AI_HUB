import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { loginWithGoogleMembership } from '../auth/supabaseMembership'
import { withTimeout } from '../lib/withTimeout'
import { googleOAuthError } from '../auth/googleOAuthError'
import {
  clearGoogleLoginReturnTo,
  getExternalAppReturnTo,
  readGoogleLoginReturnTo,
  rememberGoogleLoginReturnTo,
} from '../auth/googleLoginReturnTo'

// Preserve the registered OAuth callback URL.
export default function GoogleSignupPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const returnTo = getExternalAppReturnTo(new URLSearchParams(location.search).get('returnTo'))
    ?? readGoogleLoginReturnTo()
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [oauthFailure] = useState(() => googleOAuthError(window.location.href))
  const [revision, setRevision] = useState(0)
  const [hasUser, setHasUser] = useState(false)
  const completed = useRef(false)

  useEffect(() => {
    if (!supabase) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user && !completed.current) {
        clearTimeout(timer)
        timer = setTimeout(() => setRevision(value => value + 1), 0)
      }
    })
    return () => { clearTimeout(timer); data.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (completed.current || oauthFailure) return
        setReady(false); setError('')
        if (!supabase) throw new Error('Google 로그인 연결 설정이 필요합니다.')
        const result = await withTimeout(supabase.auth.getUser(), 15000,
          'Google 인증 확인이 지연되고 있습니다. 다시 시도해 주세요.')
        if (!active) return
        if (result.error && result.error.name !== 'AuthSessionMissingError') throw result.error
        setHasUser(!!result.data.user)
        if (!result.data.user) return
        const session = await loginWithGoogleMembership()
        if (!active) return
        if (!session) throw new Error('로그인 정보를 확인하지 못했습니다. 다시 시도해 주세요.')
        if (session.status === 'rejected') throw new Error('접근이 거절된 계정입니다. 관리자에게 문의해 주세요.')
        if (session.status !== 'approved') throw new Error('이 계정은 관리자 승인이 필요합니다.')
        completed.current = true
        clearGoogleLoginReturnTo()
        login(session)
        if (returnTo) window.location.replace(returnTo)
        else navigate('/', { replace: true })
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Google 로그인에 실패했습니다.')
      } finally { if (active) setReady(true) }
    })()
    return () => { active = false }
  }, [revision, oauthFailure, login, navigate, returnTo])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (hasUser) { setRevision(value => value + 1); return }
    if (!supabase) { setError('Google 로그인 연결 설정이 필요합니다.'); return }
    setBusy(true); setError('')
    try {
      rememberGoogleLoginReturnTo(returnTo)
      const callbackUrl = new URL(`${import.meta.env.BASE_URL}signup/google`, window.location.origin)
      const { error: authError } = await supabase.auth.signInWithOAuth({ provider: 'google', options: {
        redirectTo: callbackUrl.href,
      } })
      if (authError) throw authError
    } catch (err) { setError(err instanceof Error ? err.message : 'Google 로그인에 실패했습니다.') }
    finally { setBusy(false) }
  }

  return <main className="min-h-screen bg-background p-6 flex items-center justify-center">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface p-6 space-y-5">
      <h1 className="text-2xl font-bold">Google 계정으로 로그인</h1>
      <p>추가 정보 입력 없이 Google 계정으로 바로 이용할 수 있습니다.</p>
      {(oauthFailure || error) && <p role="alert" className="text-error">{oauthFailure || error}</p>}
      {!ready && !oauthFailure ? <p role="status">Google 로그인을 확인하고 있습니다…</p> : oauthFailure ?
        <button type="button" onClick={() => {
          const retryUrl = new URL(`${import.meta.env.BASE_URL}signup/google`, window.location.origin)
          if (returnTo) retryUrl.searchParams.set('returnTo', returnTo)
          window.location.replace(retryUrl.href)
        }}>다시 시도</button> :
        <button disabled={busy} className="w-full rounded-lg bg-primary text-white p-3 disabled:opacity-50">{busy ? '연결 중…' : hasUser ? '다시 시도' : 'Google 계정으로 계속하기'}</button>}
      <button type="button" onClick={() => navigate(returnTo
        ? `/login?returnTo=${encodeURIComponent(returnTo)}`
        : '/login')}>로그인으로 돌아가기</button>
    </form>
  </main>
}
