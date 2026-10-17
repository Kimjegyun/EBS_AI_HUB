import { useEffect, useState, type FormEvent } from 'react'
import { isLoginIdAvailable, normalizeLoginId } from '../auth/loginIdentifier'
import { setMyLoginId, updateMyPassword } from '../auth/passwordReset'
import { supabase } from '../lib/supabase'
import { Icon } from './Icon'

const inputClass = 'mt-1 block w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm text-on-surface outline-none focus:border-primary disabled:opacity-60'

/**
 * The signed-in user's 로그인 아이디·비밀번호. Google signups use it to add an ID and a
 * password, so they can also sign in on the ID/password form.
 */
export default function AccountLoginDialog({ onClose }: { onClose: () => void }) {
  const [loaded, setLoaded] = useState(!supabase)
  const [accountEmail, setAccountEmail] = useState('')
  const [currentLoginId, setCurrentLoginId] = useState('')
  const [isGoogle, setIsGoogle] = useState(false)
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [nonce, setNonce] = useState('')
  const [needsCode, setNeedsCode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth.getUser().then(({ data: { user }, error: userError }) => {
      if (!active) return
      if (userError || !user) throw new Error('계정 정보를 확인하지 못했습니다. 다시 로그인해 주세요.')
      const id = typeof user?.user_metadata?.login_id === 'string' ? user.user_metadata.login_id : ''
      const providers = (user?.app_metadata?.providers as string[] | undefined) ?? []
      setAccountEmail(user?.email ?? '')
      setCurrentLoginId(id)
      setLoginId(id)
      setIsGoogle(providers.includes('google'))
      setLoaded(true)
    }).catch((err: unknown) => {
      if (!active) return
      setLoadFailed(true)
      setLoaded(true)
      setError(err instanceof Error ? err.message : '계정 정보를 불러오지 못했습니다.')
    })
    return () => { active = false }
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setNotice('')
    const nextId = normalizeLoginId(loginId)
    const idChanged = nextId !== currentLoginId
    const wantsPassword = password.length > 0
    if (!loaded || loadFailed || saving) return
    if (isGoogle && !currentLoginId && !wantsPassword) {
      setError('Google 계정에 아이디 로그인을 추가하려면 새 비밀번호도 함께 입력해 주세요.')
      return
    }
    if (!idChanged && !wantsPassword) { setError('바꿀 아이디나 새 비밀번호를 입력해 주세요.'); return }
    if (idChanged && !/^[a-z0-9._-]{3,32}$/.test(nextId)) {
      setError('아이디는 영문 소문자, 숫자, 점, 밑줄, 하이픈으로 3~32자만 사용할 수 있습니다.')
      return
    }
    if (wantsPassword && password.length < 6) { setError('비밀번호는 6자 이상으로 입력해 주세요.'); return }
    if (wantsPassword && password !== confirm) { setError('비밀번호 확인이 일치하지 않습니다.'); return }
    if (!currentLoginId && !idChanged) { setError('아이디로 로그인하려면 아이디도 정해 주세요.'); return }
    if (needsCode && !nonce.trim()) { setError('메일로 받은 확인 코드를 입력해 주세요.'); return }

    setSaving(true)
    try {
      const done: string[] = []
      if (idChanged) {
        if (!(await isLoginIdAvailable(nextId))) { setError('이미 사용 중인 아이디입니다.'); return }
        const saved = await setMyLoginId(nextId)
        setCurrentLoginId(saved)
        setLoginId(saved)
        done.push(`아이디를 '${saved}'(으)로 저장했습니다.`)
      }
      if (wantsPassword) {
        const result = await updateMyPassword(password, needsCode ? nonce : undefined)
        if (result === 'reauth') {
          setNeedsCode(true)
          setNotice(done.join(' '))
          setError(`보안 확인이 필요합니다. ${accountEmail || '가입 이메일'}(으)로 보낸 확인 코드를 입력한 뒤 다시 저장해 주세요.`)
          return
        }
        setPassword('')
        setConfirm('')
        setNonce('')
        setNeedsCode(false)
        done.push('비밀번호를 저장했습니다.')
      }
      setNotice(wantsPassword || !isGoogle
        ? `${done.join(' ')} 이제 로그인 화면에서 아이디와 비밀번호로 로그인할 수 있습니다.`
        : `${done.join(' ')} 아직 비밀번호를 정하지 않았다면 새 비밀번호도 저장해야 아이디로 로그인할 수 있습니다.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="로그인 아이디·비밀번호">
      <form onSubmit={(event) => void submit(event)} className="flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-surface shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
          <div className="min-w-0">
            <p className="font-h3 text-h3">로그인 아이디·비밀번호</p>
            <p className="truncate text-caption text-on-surface-variant">{accountEmail}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-container-high">
            <Icon name="close" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-3 text-caption text-on-surface-variant">
          {!supabase ? (
            <p>이 환경에서는 계정 아이디·비밀번호를 바꿀 수 없습니다.</p>
          ) : !loaded ? (
            <p role="status">불러오는 중…</p>
          ) : (
            <>
              {isGoogle && (
                <p className="rounded-lg bg-primary/5 px-3 py-2 text-on-surface">
                  Google로 가입한 계정입니다. 아이디와 비밀번호를 정해 두면 Google 로그인 없이 아이디로도 로그인할 수 있습니다. Google 로그인도 그대로 쓸 수 있습니다.
                </p>
              )}
              <label className="block">로그인 아이디
                <input value={loginId} onChange={(e) => setLoginId(e.target.value)} maxLength={32} placeholder="user01" autoComplete="username" className={inputClass} disabled={saving} />
                <span className="mt-1 block text-[11px]">
                  {currentLoginId ? `현재 아이디: ${currentLoginId}` : '아직 아이디가 없습니다.'} 영문 소문자, 숫자, 점, 밑줄, 하이픈 3~32자.
                </span>
              </label>
              <label className="block">새 비밀번호
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={currentLoginId ? '바꾸지 않으려면 비워 두세요' : '6자 이상'} autoComplete="new-password" className={inputClass} disabled={saving} />
              </label>
              <label className="block">새 비밀번호 확인
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className={inputClass} disabled={saving} />
              </label>
              {needsCode && (
                <label className="block">메일 확인 코드
                  <input value={nonce} onChange={(e) => setNonce(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className={`${inputClass} font-mono tracking-widest`} disabled={saving} />
                </label>
              )}
              {error && <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-error">{error}</p>}
              {notice && <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-success">{notice}</p>}
            </>
          )}
        </div>

        <div className="flex gap-2 border-t border-outline-variant px-4 py-3">
          <button type="button" onClick={onClose} disabled={saving} className="flex-1 rounded-lg border border-outline-variant py-2.5 text-body-sm">닫기</button>
          <button type="submit" disabled={saving || !supabase || !loaded || loadFailed} className="flex-1 rounded-lg bg-primary py-2.5 text-body-sm font-semibold text-on-primary disabled:opacity-60">
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </div>
  )
}
