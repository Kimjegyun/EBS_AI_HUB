import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { isPasswordChangeRequired, updateMyPassword } from '../auth/passwordReset'
import { supabase } from '../lib/supabase'

const inputClass =
  'w-full h-12 bg-surface-container-high border-outline-variant text-on-surface font-h3 text-h3 rounded-lg px-4 border focus:ring-0 focus:border-primary-light transition-all placeholder:text-on-surface-variant/50'

/** Reads the error Supabase appends to the reset link when it is expired or already used. */
function linkError(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, '') || window.location.search)
  const code = params.get('error_code') ?? params.get('error')
  if (!code) return null
  if (code === 'otp_expired') return '재설정 링크가 만료되었거나 이미 사용되었습니다. 로그인 화면의 비밀번호 찾기에서 다시 요청해 주세요.'
  return params.get('error_description')?.replace(/\+/g, ' ') ?? '재설정 링크가 올바르지 않습니다.'
}

/**
 * New password after either the emailed reset link (비밀번호 찾기 / 관리자 재설정 메일)
 * or a sign-in with an admin-issued temporary password.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [required, setRequired] = useState(() => (location.state as { required?: boolean } | null)?.required === true)
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nonce, setNonce] = useState('')
  const [needsCode, setNeedsCode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(
    () => linkError() ?? (supabase ? null : 'Supabase가 설정되지 않아 비밀번호를 재설정할 수 없습니다.'),
  )
  const [checking, setChecking] = useState(() => sessionError === null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    if (!checking || !supabase) return
    // getSession waits until supabase-js has read the recovery tokens from the link.
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      if (session?.user) {
        setEmail(session.user.email ?? '')
        if (isPasswordChangeRequired(session.user)) setRequired(true)
      } else {
        setSessionError('재설정 링크가 만료되었거나 올바르지 않습니다. 로그인 화면의 비밀번호 찾기에서 다시 요청해 주세요.')
      }
      setChecking(false)
    }).catch(() => {
      if (!active) return
      setSessionError('세션을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setChecking(false)
    })
    return () => { active = false }
  }, [checking])

  async function backToLogin(notice?: string) {
    await supabase?.auth.signOut().catch(() => undefined)
    navigate('/login', { replace: true, state: notice ? { notice } : undefined })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword.length < 6) {
      setError('비밀번호는 6자 이상으로 입력해 주세요.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('비밀번호 확인이 일치하지 않습니다.')
      return
    }
    if (needsCode && !nonce.trim()) {
      setError('메일로 받은 확인 코드를 입력해 주세요.')
      return
    }
    setLoading(true)
    try {
      const result = await updateMyPassword(newPassword, needsCode ? nonce : undefined)
      if (result === 'reauth') {
        setNeedsCode(true)
        setError(`보안 확인이 필요합니다. ${email || '가입 이메일'}(으)로 보낸 확인 코드를 입력한 뒤 다시 눌러 주세요.`)
        return
      }
      await backToLogin('비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '비밀번호를 변경하지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 font-body bg-background text-on-surface">
      <main className="w-full max-w-[480px] space-y-8">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 bg-primary-container rounded-xl flex items-center justify-center shadow-md">
            <Icon name="lock_reset" className="text-4xl text-on-primary-container" />
          </div>
          <h1 className="font-h1 text-h1 text-primary tracking-tight">비밀번호 재설정</h1>
          <p className="text-caption text-on-surface-variant text-center max-w-xs">
            {required
              ? '관리자가 발급한 임시 비밀번호로 로그인했습니다. 계속하려면 새 비밀번호를 정해 주세요.'
              : '새로 사용할 비밀번호를 입력해 주세요.'}
          </p>
        </div>

        <div className="bg-surface-container border border-outline-variant rounded-xl p-8 shadow-xl shadow-indigo-500/5">
          {checking ? (
            <p className="text-center text-body-sm text-on-surface-variant" role="status">확인 중…</p>
          ) : sessionError ? (
            <div className="space-y-4">
              <p className="font-caption text-error bg-error-container/30 border border-error/20 rounded-lg px-3 py-2" role="alert">
                {sessionError}
              </p>
              <button type="button" onClick={() => void backToLogin()} className="w-full h-11 bg-primary-container text-on-primary-container font-h3 text-h3 rounded-lg">
                로그인 화면으로
              </button>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={(e) => void handleSubmit(e)}>
              {email && (
                <p className="px-1 text-caption text-on-surface-variant">
                  계정: <span className="font-semibold text-on-surface">{email}</span>
                </p>
              )}
              {/* Lets password managers store the new password for the right account. */}
              <input type="email" value={email} autoComplete="username" readOnly hidden />
              <div className="space-y-2">
                <label className="font-h3 text-h3 text-on-surface block px-1" htmlFor="newPassword">새 비밀번호</label>
                <input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClass} placeholder="6자 이상" autoComplete="new-password" minLength={6} required autoFocus disabled={loading} />
              </div>
              <div className="space-y-2">
                <label className="font-h3 text-h3 text-on-surface block px-1" htmlFor="confirmPassword">새 비밀번호 확인</label>
                <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass} placeholder="한 번 더 입력" autoComplete="new-password" required disabled={loading} />
              </div>
              {needsCode && (
                <div className="space-y-2">
                  <label className="font-h3 text-h3 text-on-surface block px-1" htmlFor="nonce">메일 확인 코드</label>
                  <input id="nonce" value={nonce} onChange={(e) => setNonce(e.target.value)} inputMode="numeric"
                    className={`${inputClass} font-mono tracking-widest`} placeholder="123456" autoComplete="one-time-code" disabled={loading} />
                </div>
              )}
              {error && (
                <p className="font-caption text-error bg-error-container/30 border border-error/20 rounded-lg px-3 py-2" role="alert">{error}</p>
              )}
              <button type="submit" disabled={loading}
                className="w-full h-11 bg-primary-container hover:bg-primary-dark text-on-primary-container font-h3 text-h3 rounded-lg shadow-sm transition-all disabled:opacity-60">
                {loading ? '처리 중…' : '비밀번호 변경'}
              </button>
              <button type="button" onClick={() => void backToLogin()} className="w-full text-caption text-on-surface-variant hover:text-primary">
                {required ? '나중에 하기 (로그아웃)' : '로그인 화면으로 돌아가기'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
