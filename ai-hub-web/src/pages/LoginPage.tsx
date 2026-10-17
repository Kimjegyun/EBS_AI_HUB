import type { FormEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ADMIN_UI_SESSION_KEY, verifyAdminAccessCode } from '../auth/adminAccess'
import { useAuth } from '../auth/AuthContext'
import { isLoginIdAvailable, normalizeLoginId, resolveLoginEmail } from '../auth/loginIdentifier'
import { authenticateLocal, registerLocalAccount } from '../auth/localAccounts'
import { canLoginWithRole } from '../auth/loginRolePolicy'
import { isPasswordChangeRequired, requestPasswordReset } from '../auth/passwordReset'
import { notifyAdminSignupApprovalNeeded } from '../auth/signupNotifications'
import { getSignupProfileFromUser } from '../auth/signupProfile'
import { ensureAiHubMembership, getAiHubSession } from '../auth/supabaseMembership'
import type { UserRole } from '../auth/types'
import EnvironmentSettingsDialog from '../components/EnvironmentSettingsDialog'
import { Icon } from '../components/Icon'
import InstallBanner from '../components/InstallBanner'
import { getRuntimeSupabaseConfig, isSupabaseConfigured, supabase } from '../lib/supabase'
import {
  getPortalScopedSessionItem,
  removePortalScopedSessionItem,
  setPortalScopedSessionItem,
} from '../lib/portalStorage'
import { withTimeout } from '../lib/withTimeout'
import { getExternalAppReturnTo, rememberGoogleLoginReturnTo } from '../auth/googleLoginReturnTo'

const SUPABASE_AUTH_TIMEOUT_MS = 25_000
const LOGIN_PORTAL = import.meta.env.VITE_LOGIN_PORTAL ?? 'user'
// Must match the manifest name written per portal by scripts/build-public-portals.mjs.
const HOME_SCREEN_NAME = LOGIN_PORTAL === 'admin' ? 'AI 허브 관리자' : 'EBS AI 허브'
const IS_ADMIN_PORTAL = LOGIN_PORTAL === 'admin'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, session } = useAuth()

  const requestedReturnTo = new URLSearchParams(location.search).get('returnTo')
  const safeReturnTo = getExternalAppReturnTo(requestedReturnTo) ?? '/'
  const from = (location.state as { from?: string } | null)?.from ?? safeReturnTo
  const externalAppReturnTo = getExternalAppReturnTo(from)
  const redirecting = useRef(false)
  const [externalAccessError, setExternalAccessError] = useState<string | null>(null)

  const finishLogin = useCallback(async (automatic = false) => {
    if (!externalAppReturnTo) {
      navigate(from, { replace: true })
      return
    }
    if (redirecting.current) return
    redirecting.current = true
    try {
      setExternalAccessError(null)
      const guardKey = 'ai-hub-external-login-redirect-v1'
      const previous = sessionStorage.getItem(guardKey)
      if (automatic && previous) {
        const attempt = JSON.parse(previous) as { target?: string; at?: number }
        if (attempt.target === externalAppReturnTo && typeof attempt.at === 'number' && Date.now() - attempt.at < 30_000) {
          throw new Error('앱에서 로그인을 확인하지 못해 반복 이동을 중단했습니다. Google로 다시 로그인해 주세요. 계속되면 포털과 앱의 세션 연동을 확인해야 합니다.')
        }
      }
      if (!supabase) throw new Error('앱 접속에는 Google 또는 아이디 계정 로그인이 필요합니다.')
      const { data, error: sessionError } = await withTimeout(supabase.auth.getSession(), SUPABASE_AUTH_TIMEOUT_MS)
      if (sessionError || !data.session?.access_token) {
        throw new Error('저장된 로그인 정보가 만료되었습니다. Google 또는 아이디로 다시 로그인해 주세요.')
      }
      const configResponse = await fetch('/api/auth/portal-config', { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
      if (!configResponse.ok) throw new Error('앱 인증 설정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      const config = await configResponse.json() as { url?: string }
      if (config.url?.replace(/\/+$/, '') !== getRuntimeSupabaseConfig().url.replace(/\/+$/, '')) {
        throw new Error('포털과 앱의 인증 프로젝트 설정이 다릅니다. 환경 설정의 Supabase 연결을 확인해 주세요.')
      }
      const response = await fetch('/api/auth/verify-ai-hub-session', {
        method: 'POST', cache: 'no-store',
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        signal: AbortSignal.timeout(20_000),
      })
      if (response.status === 401) throw new Error('로그인 세션이 유효하지 않습니다. Google로 다시 로그인해 주세요.')
      if (response.status === 403) throw new Error('앱을 이용하려면 계정 승인이 필요합니다. 관리자에게 승인 상태를 확인해 주세요.')
      const verified = response.ok ? await response.json() as { approved?: boolean } : null
      if (!verified?.approved) throw new Error('앱 접근 권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      sessionStorage.setItem(guardKey, JSON.stringify({ target: externalAppReturnTo, at: Date.now() }))
      window.location.replace(externalAppReturnTo)
    } catch (err) {
      setExternalAccessError(err instanceof Error ? err.message : '앱 로그인 확인에 실패했습니다.')
    } finally {
      redirecting.current = false
    }
  }, [externalAppReturnTo, from, navigate])

  const [role, setRole] = useState<UserRole>(IS_ADMIN_PORTAL ? 'admin' : 'user')
  const [email, setEmail] = useState('')
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [userDisplayName, setUserDisplayName] = useState('')
  const [organization, setOrganization] = useState('')
  const [adminDisplayName, setAdminDisplayName] = useState('')
  const [adminAccessCode, setAdminAccessCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(
    () => (location.state as { notice?: string } | null)?.notice ?? null,
  )
  const [envDialogOpen, setEnvDialogOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset'>('login')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [adminUiRevealed, setAdminUiRevealed] = useState(() => {
    if (IS_ADMIN_PORTAL) return true
    try {
      return getPortalScopedSessionItem(ADMIN_UI_SESSION_KEY) === '1'
    } catch {
      return false
    }
  })
  const [unlockCode, setUnlockCode] = useState('')
  const [revealError, setRevealError] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  const [adminDrawerOpen, setAdminDrawerOpen] = useState(false)

  useEffect(() => {
    if (!session) return
    const timer = setTimeout(() => { void finishLogin(true) }, 0)
    return () => clearTimeout(timer)
  }, [session, finishLogin])

  useEffect(() => {
    if (!adminDrawerOpen) return
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setAdminDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [adminDrawerOpen])

  async function validateAdminGate(): Promise<boolean> {
    if (!organization.trim()) {
      setError('관리자 로그인·가입에는 조직명이 필요합니다.')
      return false
    }
    if (!adminDisplayName.trim()) {
      setError('관리자 이름을 입력해 주세요.')
      return false
    }
    const valid = await verifyAdminAccessCode(adminAccessCode)
    if (!valid) {
      setError('관리자 인증 코드가 올바르지 않습니다. 서버에 ADMIN_ACCESS_CODE가 설정되어 있는지 확인하세요.')
      return false
    }
    return true
  }

  async function handleRevealAdminUi() {
    setRevealError(null)
    const trimmed = unlockCode.trim()
    if (!trimmed) {
      setRevealError('관리자 인증 코드를 입력해 주세요.')
      return
    }
    setUnlocking(true)
    try {
      const valid = await verifyAdminAccessCode(trimmed)
      if (!valid) {
        setRevealError('인증 코드가 올바르지 않습니다. 서버에 ADMIN_ACCESS_CODE가 설정되어 있는지 확인하세요.')
        return
      }
    } finally {
      setUnlocking(false)
    }
    try {
      setPortalScopedSessionItem(ADMIN_UI_SESSION_KEY, '1')
    } catch {
      /* private 모드 등 */
    }
    setAdminUiRevealed(true)
    setRole('admin')
    setAuthMode('login')
    setAdminAccessCode(trimmed)
    setUnlockCode('')
    setError(null)
    setAdminDrawerOpen(false)
    setEnvDialogOpen(true)
  }

  function hideAdminUi() {
    try {
      removePortalScopedSessionItem(ADMIN_UI_SESSION_KEY)
    } catch {
      /* ignore */
    }
    setAdminUiRevealed(false)
    setUnlockCode('')
    setRevealError(null)
    setRole('user')
    setAdminAccessCode('')
    setOrganization('')
    setAdminDisplayName('')
    setError(null)
    setAdminDrawerOpen(false)
  }

  function openResetMode() {
    // In login mode the first field holds the 아이디; carry it over.
    if (authMode === 'login' && !email.includes('@')) {
      if (email.trim()) setLoginId(email.trim())
      setEmail('')
    }
    setAuthMode('reset')
    setError(null)
    setNotice(null)
  }

  async function handleResetRequest() {
    const loginIdTrim = normalizeLoginId(loginId)
    const emailTrim = email.trim()
    if (!loginIdTrim || !emailTrim) {
      setError('아이디와 가입한 이메일을 모두 입력해 주세요.')
      return
    }
    if (!isSupabaseConfigured()) {
      setError('이 환경에서는 메일로 비밀번호를 재설정할 수 없습니다. 관리자에게 비밀번호 초기화를 요청해 주세요.')
      return
    }
    setSubmitting(true)
    try {
      const result = await requestPasswordReset(loginIdTrim, emailTrim)
      if (result === 'mismatch') {
        setError('아이디와 이메일이 일치하는 계정이 없습니다. Google로 가입한 계정은 Google 로그인을 이용해 주세요.')
        return
      }
      setNotice(`${emailTrim} 로 비밀번호 재설정 메일을 보냈습니다. 메일의 링크를 눌러 새 비밀번호를 설정해 주세요. 메일이 없으면 스팸함도 확인해 주세요.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '재설정 메일을 보내지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (authMode === 'reset') {
      await handleResetRequest()
      return
    }

    const emailTrim = email.trim()
    const loginIdTrim = normalizeLoginId(loginId)
    const loginIdentifier = authMode === 'login' ? normalizeLoginId(email) : loginIdTrim
    if (authMode === 'login' && (!loginIdentifier || !password)) {
      setError('아이디와 비밀번호를 입력해 주세요.')
      return
    }
    if (authMode === 'register' && (!emailTrim || !loginIdTrim || !password)) {
      setError('이메일, 아이디, 비밀번호를 입력해 주세요.')
      return
    }
    if (!emailTrim || !password) {
      setError('이메일과 비밀번호를 입력해 주세요.')
      return
    }

    if (authMode === 'register') {
      if (!/^[a-z0-9._-]{3,32}$/.test(loginIdTrim)) {
        setError('아이디는 영문 소문자, 숫자, 점, 밑줄, 하이픈으로 3~32자만 사용할 수 있습니다.')
        return
      }
      if (password.length < 6) {
        setError('비밀번호는 6자 이상으로 입력해 주세요.')
        return
      }
      if (password !== confirmPassword) {
        setError('비밀번호 확인이 일치하지 않습니다.')
        return
      }
    }

    if (role === 'admin' && !adminUiRevealed) {
      setError('관리자 화면이 활성화되지 않았습니다. 먼저 인증 코드로 관리자 메뉴를 표시해 주세요.')
      return
    }

    if (role === 'admin' && !(await validateAdminGate())) {
      return
    }

    const sb = isSupabaseConfigured() ? supabase : null

    setSubmitting(true)
    try {
      if (authMode === 'register') {
        const displayNameUser =
          userDisplayName.trim() || emailTrim.split('@')[0] || '사용자'
        const displayNameAdmin = adminDisplayName.trim()
        const org = organization.trim()

        if (sb) {
          const available = await isLoginIdAvailable(loginIdTrim)
          if (!available) {
            setError('이미 사용 중인 아이디입니다.')
            return
          }
          const meta =
            role === 'admin'
              ? {
                  app_role: 'admin' as const,
                  display_name: displayNameAdmin,
                  login_id: loginIdTrim,
                  organization: org,
                }
              : {
                  app_role: 'user' as const,
                  display_name: displayNameUser,
                  login_id: loginIdTrim,
                  organization: null as null,
                }
          const { data, error: signErr } = await withTimeout(
            sb.auth.signUp({
              email: emailTrim,
              password,
              options: {
                data: meta,
                // 인증 메일 링크가 Supabase 기본 Site URL(localhost) 대신 현재 접속 주소로 돌아오도록 지정
                emailRedirectTo: new URL(`${import.meta.env.BASE_URL}login`, window.location.origin).href,
              },
            }),
            SUPABASE_AUTH_TIMEOUT_MS,
            '회원가입 요청이 시간 초과되었습니다. 네트워크와 Supabase 설정을 확인해 주세요.',
          )
          if (signErr) {
            setError(signErr.message)
            return
          }
          const signedUser = data.user
          if (!signedUser) {
            setError('회원가입 응답에 사용자 정보가 없습니다. 잠시 후 다시 시도해 주세요.')
            return
          }
          if (data.session) {
            const membership = await ensureAiHubMembership({
              displayName: role === 'admin' ? displayNameAdmin : displayNameUser,
              organization: role === 'admin' ? org : null,
              requestedRole: role,
            })
            if (!membership) {
              setError('EBS AI 허브 멤버십 정보를 생성하지 못했습니다.')
              return
            }
            if (membership.status !== 'approved') {
              await notifyAdminSignupApprovalNeeded(membership)
              await sb.auth.signOut()
              setError(
                membership.role === 'admin'
                  ? '관리자 가입 요청이 저장되었습니다. 기존 관리자의 승인 후 로그인할 수 있습니다.'
                  : '회원가입 요청이 저장되었습니다. 관리자의 승인 후 로그인할 수 있습니다.',
              )
              return
            }
            login(membership)
            finishLogin()
            return
          }
          // No session means signup did not authenticate the user. Supabase may
          // also return an obfuscated user for an already registered address.
          if (signedUser.identities?.length === 0) {
            setError('이 이메일로 가입을 완료하지 못했습니다. 이미 가입한 이메일이면 기존 아이디·비밀번호 또는 Google로 로그인해 주세요. 비밀번호를 잊었다면 비밀번호 재설정을 이용해 주세요.')
            return
          }
          setNotice(
            `가입 요청을 접수했습니다. ${emailTrim} 메일함에서 인증 링크를 확인해 주세요. 이메일 인증과 기존 관리자의 승인이 완료된 뒤 로그인할 수 있습니다. 이미 가입한 이메일이라면 기존 계정으로 로그인하거나 비밀번호를 재설정해 주세요.`,
          )
          return
        }

        const reg = await registerLocalAccount({
          email: emailTrim,
          loginId: loginIdTrim,
          password,
          role,
          displayName: role === 'admin' ? displayNameAdmin : displayNameUser,
          organization: role === 'admin' ? org : null,
        })
        if (!reg.ok) {
          setError(reg.message)
          return
        }
        login({
          role,
          email: emailTrim,
          displayName: role === 'admin' ? displayNameAdmin : displayNameUser,
          organization: role === 'admin' ? org : null,
        })
        finishLogin()
        return
      }

      if (sb) {
        const authEmail = await resolveLoginEmail(loginIdentifier)
        if (!authEmail) {
          setError('아이디 또는 비밀번호가 올바르지 않습니다. Google로 가입했다면 Google로 로그인한 뒤 상단의 열쇠 아이콘에서 아이디·비밀번호를 설정할 수 있습니다.')
          return
        }
        const { data, error: signInErr } = await withTimeout(
          sb.auth.signInWithPassword({
            email: authEmail,
            password,
          }),
          SUPABASE_AUTH_TIMEOUT_MS,
          '로그인 요청이 시간 초과되었습니다. 네트워크와 Supabase 설정을 확인해 주세요.',
        )
        if (signInErr) {
          setError(signInErr.message)
          return
        }
        if (!data.user) {
          setError('로그인에 실패했습니다.')
          return
        }
        let mapped = await getAiHubSession()
        if (!mapped) {
          const profile = getSignupProfileFromUser(data.user, role)
          mapped = await ensureAiHubMembership({
            displayName: profile.displayName,
            organization: profile.organization,
            requestedRole: profile.requestedRole,
          })
          if (!mapped) {
            setError('EBS AI 허브 멤버십 정보를 생성하지 못했습니다. 관리자에게 문의해 주세요.')
            await sb.auth.signOut()
            return
          }
        }
        if (mapped.status !== 'approved') {
          await notifyAdminSignupApprovalNeeded(mapped)
          setError('아직 관리자의 승인을 기다리는 계정입니다.')
          await sb.auth.signOut()
          return
        }
        if (role === 'admin' && mapped.role !== 'admin') {
          setError('이 계정은 관리자가 아닙니다. 일반 사용자로 로그인해 주세요.')
          await sb.auth.signOut()
          return
        }
        if (!canLoginWithRole(role, mapped.role, externalAppReturnTo)) {
          setError('이 계정은 일반 사용자가 아닙니다. 관리자 탭에서 로그인해 주세요.')
          await sb.auth.signOut()
          return
        }
        if (isPasswordChangeRequired(data.user)) {
          // Admin-issued temporary password: pick a new one before entering the hub.
          navigate('/reset-password', { replace: true, state: { required: true } })
          return
        }
        login(mapped)
        finishLogin()
        return
      }

      const localSession = await authenticateLocal({
        loginId: loginIdentifier,
        password,
      })
      if (!localSession) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다. 회원가입을 먼저 진행해 주세요.')
        return
      }
      if (role === 'admin' && localSession.role !== 'admin') {
        setError('이 계정은 관리자가 아닙니다. 일반 사용자로 로그인해 주세요.')
        return
      }
      if (!canLoginWithRole(role, localSession.role, externalAppReturnTo)) {
        setError('이 계정은 일반 사용자가 아닙니다. 관리자 탭에서 로그인해 주세요.')
        return
      }
      login(localSession)
      finishLogin()
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 font-body bg-background text-on-surface relative overflow-hidden">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(circle at top left, #f5f3ff 0%, #f8fafc 100%)',
        }}
      />
      <div className="fixed top-0 right-0 -z-10 w-[500px] h-[500px] bg-primary-container/5 blur-[120px] rounded-full translate-x-1/2 -translate-y-1/2" />
      <div className="fixed bottom-0 left-0 -z-10 w-[400px] h-[400px] bg-secondary-container/10 blur-[100px] rounded-full -translate-x-1/2 translate-y-1/2" />

      {IS_ADMIN_PORTAL && (
      <div className="fixed top-4 right-4 z-[80] print:hidden">
        <button
          type="button"
          onClick={() => {
            setRevealError(null)
            if (adminUiRevealed) {
              setEnvDialogOpen(true)
              setAdminDrawerOpen(false)
              return
            }
            setAdminDrawerOpen(true)
          }}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-white px-4 py-2 text-on-surface-variant shadow-md transition-all hover:border-primary/40 hover:bg-surface-container-high hover:text-primary ${
            adminUiRevealed
              ? 'border-primary/40 text-primary opacity-90'
              : 'border-outline-variant opacity-100'
          }`}
          aria-expanded={adminDrawerOpen}
          aria-controls="admin-access-drawer"
          aria-label="환경설정"
          title="환경설정"
        >
          <Icon name="tune" className="text-[20px]" />
          <span className="font-h3 text-h3">환경설정</span>
        </button>
      </div>
      )}

      {IS_ADMIN_PORTAL && adminDrawerOpen && (
        <>
          <button
            type="button"
            className="hidden"
            aria-label="패널 닫기"
            onClick={() => setAdminDrawerOpen(false)}
          />
          <aside
            id="admin-access-drawer"
            className="fixed right-0 top-0 z-[100] flex h-full w-[min(100vw,20rem)] flex-col border-l border-outline-variant bg-surface-container shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-drawer-title"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-outline-variant px-4 py-3">
              <span id="admin-drawer-title" className="font-h3 text-h3 text-on-surface">
                시스템
              </span>
              <button
                type="button"
                className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                aria-label="닫기"
                onClick={() => setAdminDrawerOpen(false)}
              >
                <Icon name="close" className="text-[22px]" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {!adminUiRevealed ? (
                <div className="space-y-3">
                  <p className="font-caption text-caption text-on-surface-variant leading-relaxed">
                    조직에서 안내받은 관리자 인증 코드를 입력하면 관리자 로그인·회원가입 항목이 메인 화면에 표시됩니다.
                  </p>
                  <div className="space-y-2">
                    <label className="font-h3 text-h3 text-on-surface block" htmlFor="unlockAdminCodeDrawer">
                      관리자 인증 코드
                    </label>
                    <input
                      id="unlockAdminCodeDrawer"
                      className="w-full h-11 rounded-lg border border-outline-variant bg-white px-3 font-h3 text-h3 text-on-surface focus:border-primary-light focus:outline-none focus:ring-0 font-mono tracking-wide"
                      type="password"
                      placeholder="코드 입력"
                      value={unlockCode}
                      onChange={(ev) => {
                        setUnlockCode(ev.target.value)
                        setRevealError(null)
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') {
                          ev.preventDefault()
                          void handleRevealAdminUi()
                        }
                      }}
                      autoComplete="off"
                    />
                  </div>
                  {revealError && (
                    <p
                      className="font-caption text-error bg-error-container/30 border border-error/20 rounded-lg px-3 py-2"
                      role="alert"
                    >
                      {revealError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleRevealAdminUi()}
                    disabled={unlocking}
                    className="w-full h-11 rounded-lg bg-primary font-h3 text-h3 text-on-primary hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {unlocking ? '확인 중' : '관리자 화면 표시'}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="font-caption text-caption text-on-surface-variant leading-relaxed">
                    관리자 로그인·가입 탭이 메인 화면에 표시된 상태입니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEnvDialogOpen(true)
                      setAdminDrawerOpen(false)
                    }}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary font-h3 text-h3 text-on-primary hover:opacity-90 transition-opacity"
                  >
                    <Icon name="tune" className="text-[18px]" />
                    API 설정
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      hideAdminUi()
                    }}
                    className="w-full h-11 rounded-lg border border-outline-variant bg-surface-container-high font-h3 text-h3 text-on-surface hover:bg-surface-container transition-colors"
                  >
                    관리자 메뉴 숨기기
                  </button>
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      <main className="w-full max-w-[480px] space-y-8 z-0">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 bg-primary-container rounded-xl flex items-center justify-center shadow-md">
            <Icon name="hub" className="text-4xl text-on-primary-container" />
          </div>
          <h1 className="font-h1 text-h1 text-primary tracking-tight">EBS AI 허브</h1>
          <p className="text-caption text-on-surface-variant text-center max-w-xs">
            {adminUiRevealed
              ? '역할을 선택한 뒤 로그인하거나 회원가입하세요. 관리자는 조직 정보와 인증 코드가 필요합니다.'
              : '일반 사용자로 로그인하거나 회원가입할 수 있습니다.'}
          </p>
        </div>

        <div className="bg-surface-container border border-outline-variant rounded-xl p-8 shadow-xl shadow-indigo-500/5">
          <div className="mb-6">
            <p className="font-label text-label text-on-surface-variant uppercase tracking-wider mb-2 px-1">
              계정 유형
            </p>
            <div className="space-y-2 p-1 bg-surface-container-high rounded-xl border border-outline-variant">
              <div
                className={`grid gap-2 ${adminUiRevealed ? 'grid-cols-2' : 'grid-cols-1'}`}
                role="group"
                aria-label="사용자 유형"
              >
                <button
                  type="button"
                  onClick={() => {
                    setRole('user')
                    setError(null)
                    setConfirmPassword('')
                  }}
                  className={`flex min-h-[3rem] items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-3 font-h3 text-h3 transition-all ${
                    role === 'user'
                      ? 'border border-outline-variant bg-white text-primary shadow-sm'
                      : 'text-on-surface-variant hover:bg-white/60 hover:text-on-surface'
                  }`}
                >
                  <Icon name="person" className="shrink-0 text-[20px]" />
                  일반 사용자
                </button>
                {adminUiRevealed && (
                  <button
                    type="button"
                    onClick={() => {
                      setRole('admin')
                      setError(null)
                      setConfirmPassword('')
                    }}
                    className={`flex min-h-[3rem] items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-3 font-h3 text-h3 transition-all ${
                      role === 'admin'
                        ? 'border-2 border-primary bg-primary/10 text-primary shadow-sm'
                        : 'text-on-surface-variant hover:bg-white/60 hover:text-on-surface'
                    }`}
                  >
                    <Icon name="admin_panel_settings" className="shrink-0 text-[20px]" />
                    관리자
                  </button>
                )}
              </div>
              {adminUiRevealed && role === 'admin' && (
                <button
                  type="button"
                  onClick={() => setEnvDialogOpen(true)}
                  className="flex min-h-[3rem] w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-outline-variant bg-white px-3 py-3 font-h3 text-h3 text-primary shadow-sm transition-all hover:bg-primary/5"
                  aria-label="공용 환경 설정 (Supabase)"
                >
                  <Icon name="tune" className="shrink-0 text-[20px]" />
                  환경 설정
                </button>
              )}
            </div>
            <div className="mt-4 p-1 bg-surface-container-high rounded-xl border border-outline-variant flex gap-1">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login')
                  setError(null)
                  setConfirmPassword('')
                }}
                className={`flex-1 rounded-lg border py-2.5 font-h3 text-h3 transition-all ${
                  authMode === 'login'
                    ? 'border-outline-variant bg-white text-primary shadow-sm'
                    : 'border-transparent text-on-surface-variant hover:bg-white/60 hover:text-on-surface'
                }`}
              >
                로그인
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register')
                  setError(null)
                  setConfirmPassword('')
                }}
                className={`flex-1 rounded-lg border py-2.5 font-h3 text-h3 transition-all ${
                  authMode === 'register'
                    ? 'border-outline-variant bg-white text-primary shadow-sm'
                    : 'border-transparent text-on-surface-variant hover:bg-white/60 hover:text-on-surface'
                }`}
              >
                회원가입
              </button>
            </div>
          </div>

          {authMode === 'reset' ? (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-1 px-1">
              <p className="font-h3 text-h3 text-on-surface flex items-center gap-2">
                <Icon name="lock_reset" className="text-[20px] text-primary" />
                비밀번호 찾기
              </p>
              <p className="font-caption text-caption text-on-surface-variant">
                아이디와 가입한 이메일이 같은 계정인지 확인한 뒤, 그 이메일로 비밀번호 재설정 링크를 보냅니다.
              </p>
            </div>
            <div className="space-y-2">
              <label className="font-h3 text-h3 text-on-surface block px-1" htmlFor="resetLoginId">아이디</label>
              <input
                className="w-full h-12 bg-surface-container-high border-outline-variant text-on-surface font-h3 text-h3 rounded-lg px-4 border focus:ring-0 focus:border-primary-light transition-all placeholder:text-on-surface-variant/50"
                id="resetLoginId"
                placeholder="user01"
                value={loginId}
                onChange={(ev) => setLoginId(ev.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="font-h3 text-h3 text-on-surface block px-1" htmlFor="resetEmail">가입한 이메일</label>
              <input
                className="w-full h-12 bg-surface-container-high border-outline-variant text-on-surface font-h3 text-h3 rounded-lg px-4 border focus:ring-0 focus:border-primary-light transition-all placeholder:text-on-surface-variant/50"
                id="resetEmail"
                type="email"
                placeholder="example@company.ai"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                autoComplete="email"
                required
              />
            </div>
            {error && (
              <p className="font-caption text-error bg-error-container/30 border border-error/20 rounded-lg px-3 py-2" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="font-caption text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2" role="status">
                {notice}
              </p>
            )}
            <button
              className="w-full h-11 bg-primary-container hover:bg-primary-dark text-on-primary-container font-h3 text-h3 rounded-lg shadow-sm active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none"
              type="submit"
              disabled={submitting}
            >
              {submitting ? '확인 중…' : '재설정 메일 받기'}
            </button>
            <p className="px-1 font-caption text-caption text-on-surface-variant">
              이메일을 받을 수 없으면 관리자에게 비밀번호 초기화를 요청하세요. 관리자가 알려 준 임시 비밀번호로 로그인하면 새 비밀번호를 정하는 화면이 열립니다.
            </p>
          </form>
          ) : (
          <form className="space-y-6" onSubmit={handleSubmit}>
            {role === 'admin' && (
              <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="font-h3 text-h3 text-primary flex items-center gap-2">
                  <Icon name="business" className="text-[20px]" />
                  관리자 정보
                </p>
                <div className="space-y-2">
                  <label className="font-h3 text-h3 text-on-surface block px-1" htmlFor="organization">
                    조직 · 회사명 <span className="text-error">*</span>
                  </label>
                  <div className="relative shadow-glow rounded-lg">
                    <input
                      className="w-full h-12 bg-white border-outline-variant text-on-surface font-h3 text-h3 rounded-lg px-4 border focus:ring-0 focus:border-primary-light transition-all placeholder:text-on-surface-variant/50"
                      id="organization"
                      placeholder="예: ACME Corp"
                      value={organization}
                      onChange={(ev) => setOrganization(ev.target.value)}
                      autoComplete="organization"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="font-h3 text-h3 text-on-surface block px-1" htmlFor="adminDisplayName">
                    관리자 이름 <span className="text-error">*</span>
                  </label>
                  <div className="relative shadow-glow rounded-lg">
                    <input
                      className="w-full h-12 bg-white border-outline-variant text-on-surface font-h3 text-h3 rounded-lg px-4 border focus:ring-0 focus:border-primary-light transition-all placeholder:text-on-surface-variant/50"
                      id="adminDisplayName"
                      placeholder="홍길동"
                      value={adminDisplayName}
                      onChange={(ev) => setAdminDisplayName(ev.target.value)}
                      autoComplete="name"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="font-h3 text-h3 text-on-surface block px-1" htmlFor="adminAccessCode">
                    관리자 인증 코드 <span className="text-error">*</span>
                  </label>
                  <div className="relative shadow-glow rounded-lg">
                    <input
                      className="w-full h-12 bg-white border-outline-variant text-on-surface font-h3 text-h3 rounded-lg px-4 border focus:ring-0 focus:border-primary-light transition-all placeholder:text-on-surface-variant/50 font-mono tracking-wide"
                      id="adminAccessCode"
                      placeholder="••••••••"
                      type="password"
                      value={adminAccessCode}
                      onChange={(ev) => setAdminAccessCode(ev.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>
            )}

            {role === 'user' && authMode === 'register' && (
              <div className="space-y-2">
                <label className="font-h3 text-h3 text-on-surface block px-1" htmlFor="userDisplayName">
                  표시 이름 <span className="text-on-surface-variant font-body-sm">(선택)</span>
                </label>
                <div className="relative shadow-glow rounded-lg">
                  <input
                    className="w-full h-12 bg-surface-container-high border-outline-variant text-on-surface font-h3 text-h3 rounded-lg px-4 border focus:ring-0 focus:border-primary-light transition-all placeholder:text-on-surface-variant/50"
                    id="userDisplayName"
                    placeholder="비워 두면 이메일 앞부분이 사용됩니다"
                    value={userDisplayName}
                    onChange={(ev) => setUserDisplayName(ev.target.value)}
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="font-h3 text-h3 text-on-surface block px-1">
                {authMode === 'login' ? '아이디' : '이메일'}
              </div>
              <label className="sr-only" htmlFor="email">
                이메일
              </label>
              <div className="relative shadow-glow rounded-lg">
                <input
                  className="w-full h-12 bg-surface-container-high border-outline-variant text-on-surface font-h3 text-h3 rounded-lg px-4 border focus:ring-0 focus:border-primary-light transition-all placeholder:text-on-surface-variant/50"
                  id="email"
                  placeholder={authMode === 'login' ? 'user01' : 'example@company.ai'}
                  type={authMode === 'login' ? 'text' : 'email'}
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  autoComplete={authMode === 'login' ? 'username' : 'email'}
                  required
                />
              </div>
            </div>

            {authMode === 'register' && (
              <div className="space-y-2">
                <label className="font-h3 text-h3 text-on-surface block px-1" htmlFor="loginId">
                  아이디 <span className="text-error">*</span>
                </label>
                <div className="relative shadow-glow rounded-lg">
                  <input
                    className="w-full h-12 bg-surface-container-high border-outline-variant text-on-surface font-h3 text-h3 rounded-lg px-4 border focus:ring-0 focus:border-primary-light transition-all placeholder:text-on-surface-variant/50"
                    id="loginId"
                    placeholder="user01"
                    type="text"
                    value={loginId}
                    onChange={(ev) => setLoginId(ev.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>
                <p className="px-1 font-caption text-caption text-on-surface-variant">
                  영문 소문자, 숫자, 점, 밑줄, 하이픈으로 3~32자만 사용할 수 있습니다.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="font-h3 text-h3 text-on-surface block" htmlFor="password">
                  비밀번호
                </label>
                {authMode === 'login' && (
                  <button
                    type="button"
                    className="font-caption text-caption text-primary hover:text-primary-dark transition-colors"
                    onClick={openResetMode}
                  >
                    비밀번호 찾기
                  </button>
                )}
              </div>
              <div className="relative shadow-glow rounded-lg">
                <input
                  className="w-full h-12 bg-surface-container-high border-outline-variant text-on-surface font-h3 text-h3 rounded-lg px-4 border focus:ring-0 focus:border-primary-light transition-all placeholder:text-on-surface-variant/50"
                  id="password"
                  placeholder="••••••••"
                  type="password"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                  required
                  minLength={authMode === 'register' ? 6 : undefined}
                />
              </div>
            </div>

            {authMode === 'register' && (
              <div className="space-y-2">
                <label className="font-h3 text-h3 text-on-surface block px-1" htmlFor="confirmPassword">
                  비밀번호 확인 <span className="text-error">*</span>
                </label>
                <div className="relative shadow-glow rounded-lg">
                  <input
                    className="w-full h-12 bg-surface-container-high border-outline-variant text-on-surface font-h3 text-h3 rounded-lg px-4 border focus:ring-0 focus:border-primary-light transition-all placeholder:text-on-surface-variant/50"
                    id="confirmPassword"
                    placeholder="비밀번호를 다시 입력하세요"
                    type="password"
                    value={confirmPassword}
                    onChange={(ev) => setConfirmPassword(ev.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="font-caption text-error bg-error-container/30 border border-error/20 rounded-lg px-3 py-2" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="font-caption text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2" role="status">
                {notice}
              </p>
            )}

            <button
              className="w-full h-11 bg-primary-container hover:bg-primary-dark text-on-primary-container font-h3 text-h3 rounded-lg shadow-sm active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none"
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? '처리 중…'
                : authMode === 'register'
                  ? role === 'admin'
                    ? '관리자 회원가입'
                    : '회원가입'
                  : role === 'admin'
                    ? '관리자로 로그인'
                    : '로그인'}
            </button>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-outline-variant" />
              <span className="flex-shrink mx-4 font-caption text-caption text-on-surface-variant">
                또는
              </span>
              <div className="flex-grow border-t border-outline-variant" />
            </div>
            <button
              className="w-full h-11 bg-white hover:bg-slate-50 border border-outline-variant text-on-surface font-h3 text-h3 rounded-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
              type="button"
              onClick={() => {
                try {
                  rememberGoogleLoginReturnTo(externalAppReturnTo)
                  navigate(externalAppReturnTo
                    ? `/signup/google?returnTo=${encodeURIComponent(externalAppReturnTo)}`
                    : '/signup/google')
                } catch (err) {
                  setError(err instanceof Error
                    ? `Google 로그인 후 복귀 경로를 저장하지 못했습니다: ${err.message}`
                    : 'Google 로그인 후 복귀 경로를 저장하지 못했습니다.')
                }
              }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Google 계정으로 계속하기
            </button>
            {externalAccessError && <p role="alert" className="rounded-lg bg-error/10 p-3 text-body-sm text-error">{externalAccessError}</p>}
            {authMode === 'login' && (
              <p className="text-center text-caption text-on-surface-variant">
                Google 가입자도 아이디로 로그인할 수 있습니다. 먼저 Google로 로그인한 뒤 내정보/설정에서 ‘아이디·비밀번호 설정’을 완료해 주세요.
              </p>
            )}
          </form>
          )}
        </div>

        <footer className="text-center">
          <p className="font-body text-body text-on-surface-variant">
            {authMode === 'login' ? (
              <>
                계정이 없으신가요?{' '}
                <button
                  type="button"
                  className="text-primary font-medium hover:underline"
                  onClick={() => {
                    setAuthMode('register')
                    setError(null)
                    setConfirmPassword('')
                  }}
                >
                  회원가입
                </button>
              </>
            ) : (
              <>
                이미 계정이 있으신가요?{' '}
                <button
                  type="button"
                  className="text-primary font-medium hover:underline"
                  onClick={() => {
                    setAuthMode('login')
                    setError(null)
                    setConfirmPassword('')
                  }}
                >
                  로그인
                </button>
              </>
            )}
          </p>
        </footer>

        <InstallBanner
          appName={HOME_SCREEN_NAME}
          title="EBS AI 허브를 홈 화면에 추가하세요"
          description="다음부터 주소 입력 없이 앱 아이콘으로 바로 실행할 수 있습니다."
        />

        <EnvironmentSettingsDialog open={envDialogOpen} onClose={() => setEnvDialogOpen(false)} />
      </main>
    </div>
  )
}
