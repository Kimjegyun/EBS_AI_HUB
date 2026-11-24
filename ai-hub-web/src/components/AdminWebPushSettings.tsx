import { useEffect, useState } from 'react'
import { disableAdminWebPush, enableAdminWebPush, getAdminWebPushState } from '../lib/adminWebPush'
import { Icon } from './Icon'

type PushState = 'loading' | 'unsupported' | 'not-configured' | 'denied' | 'enabled' | 'disabled'

export default function AdminWebPushSettings() {
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = async () => {
    setState(await getAdminWebPushState())
  }

  useEffect(() => { void refresh().catch(() => setState('unsupported')) }, [])

  const toggle = async () => {
    setBusy(true)
    setError('')
    try {
      if (state === 'enabled') await disableAdminWebPush()
      else await enableAdminWebPush()
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '알림 설정을 변경하지 못했습니다.')
      await refresh().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-3 flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm sm:flex-row sm:items-center">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon name="notifications_active" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-h3 text-h3 text-on-surface">휴대폰 가입 알림</h2>
        <p className="mt-1 text-caption text-on-surface-variant">
          새 가입 신청이 오면 이 관리자 계정의 기기에 푸시 알림을 보냅니다. 자세한 내용과 승인은 앱에서 확인합니다.
        </p>
        {state === 'denied' && <p className="mt-1 text-caption text-error">브라우저 설정에서 이 사이트의 알림을 허용해 주세요.</p>}
        {state === 'not-configured' && <p className="mt-1 text-caption text-warning">서버의 무료 Web Push 키 설정이 필요합니다.</p>}
        {state === 'unsupported' && <p className="mt-1 text-caption text-warning">Chrome Android에서 관리자 포털을 열어 알림을 설정해 주세요.</p>}
        {error && <p className="mt-1 text-caption text-error" role="alert">{error}</p>}
      </div>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy || state === 'loading' || state === 'unsupported' || state === 'not-configured' || state === 'denied'}
        className="shrink-0 rounded-lg bg-primary px-4 py-2 font-label text-label text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? '처리 중…' : state === 'enabled' ? '알림 끄기' : state === 'loading' ? '확인 중…' : '알림 켜기'}
      </button>
    </section>
  )
}
