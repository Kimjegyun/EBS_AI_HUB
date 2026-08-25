import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { supabase } from '../lib/supabase'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [validSession, setValidSession] = useState(false)

  useEffect(() => {
    // Check if we have a valid recovery session
    const checkSession = async () => {
      try {
        if (!supabase) {
          setError('Supabase가 설정되지 않았습니다.')
          return
        }
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          setValidSession(true)
        } else {
          setError('비밀번호 재설정 링크가 만료되었거나 유효하지 않습니다.')
        }
      } catch (err) {
        setError('세션을 확인하는 중 오류가 발생했습니다.')
      }
    }
    checkSession()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!newPassword || !confirmPassword) {
      setError('모든 필드를 입력해 주세요.')
      return
    }

    if (newPassword.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }

    setLoading(true)

    try {
      if (!supabase) {
        throw new Error('Supabase가 설정되지 않았습니다.')
      }
      
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (updateError) {
        throw updateError
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/login')
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '비밀번호 변경 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <div className="bg-surface rounded-lg shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon name="check_circle" className="text-success text-4xl" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">비밀번호 변경 완료</h2>
            <p className="text-muted mb-4">
              비밀번호가 성공적으로 변경되었습니다.
            </p>
            <p className="text-sm text-muted">
              잠시 후 로그인 페이지로 이동합니다...
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="bg-surface rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">비밀번호 재설정</h1>
            <p className="text-muted">새로운 비밀번호를 입력해 주세요.</p>
          </div>

          {!validSession ? (
            <div className="bg-error/10 border border-error/20 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <Icon name="error" className="text-error text-xl flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-error font-medium mb-1">세션 오류</p>
                  <p className="text-sm text-error/80">{error}</p>
                  <button
                    onClick={() => navigate('/login')}
                    className="mt-3 text-sm text-error hover:underline"
                  >
                    로그인 페이지로 돌아가기
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-error/10 border border-error/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Icon name="error" className="text-error text-xl flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-error">{error}</p>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-foreground mb-2">
                  새 비밀번호
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  placeholder="새 비밀번호 입력"
                  disabled={loading}
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground mb-2">
                  비밀번호 확인
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  placeholder="비밀번호 재입력"
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Icon name="sync" className="animate-spin" />
                    처리 중...
                  </>
                ) : (
                  <>
                    <Icon name="lock_reset" />
                    비밀번호 변경
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-sm text-muted hover:text-foreground transition-colors"
                >
                  로그인 페이지로 돌아가기
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// Made with Bob
