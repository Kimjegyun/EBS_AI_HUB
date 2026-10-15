import { useCallback, useEffect, useState } from 'react'

const buildId = import.meta.env.VITE_INVENTORY_BUILD_ID as string | undefined
const builtAt = import.meta.env.VITE_INVENTORY_BUILT_AT as string | undefined
const versionUrl = (import.meta.env.VITE_APP_VERSION_URL as string | undefined) || '/inventory-version.json'

/** Compare the loaded application with the server hosting this exact QR URL. */
export default function InventoryBuildStatus() {
  const [status, setStatus] = useState<'checking' | 'current' | 'outdated' | 'offline'>('checking')
  const [updating, setUpdating] = useState(false)
  const [message, setMessage] = useState('')
  const check = useCallback(async (signal?: AbortSignal) => {
    if (!buildId) return
    setStatus('checking')
    try {
      const response = await fetch(`${versionUrl}?check=${Date.now()}`, {
        cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
      })
      if (!response.ok) throw new Error('Version unavailable')
      const server = await response.json() as { buildId?: unknown }
      if (typeof server.buildId !== 'string' || !server.buildId) throw new Error('Invalid version')
      if (!signal?.aborted) setStatus(server.buildId === buildId ? 'current' : 'outdated')
      return server.buildId
    } catch {
      if (!signal?.aborted) setStatus('offline')
    }
  }, [])

  const update = async () => {
    if (updating) return
    setUpdating(true); setMessage('')
    try {
      const latest = await check()
      if (!latest) { setMessage('서버에 연결할 수 없습니다. 인터넷 연결 후 다시 시도해 주세요.'); return }
      if (latest === buildId) { setMessage('현재 최신 버전을 사용하고 있습니다.'); return }
      if (!window.confirm('새 버전을 적용하면 화면을 다시 불러옵니다. 저장하지 않은 입력은 사라질 수 있습니다. 건별 저장을 완료하셨나요?')) return
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration()
        await registration?.update()
      }
      // Keep IndexedDB, photos, login and preferences intact. Navigations are network-first.
      window.location.reload()
    } catch { setMessage('업데이트하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.') }
    finally { setUpdating(false) }
  }

  useEffect(() => {
    const controller = new AbortController()
    const refresh = () => { if (!document.hidden) void check(controller.signal) }
    refresh()
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      controller.abort()
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [check])

  if (!buildId) return null
  return (
    <footer className="mt-3 border-t border-outline-variant bg-surface-container px-3 py-3 text-xs text-on-surface-variant">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span role="status">{status === 'checking' ? '서버 버전 확인 중' : status === 'current' ? '최신 버전 사용 중' : status === 'outdated' ? '새 버전이 있습니다' : '서버 연결 확인 불가'}</span>
        <button type="button" disabled={updating || status === 'checking'} onClick={() => void update()} className="rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary disabled:opacity-50">{updating ? '업데이트 확인 중…' : '앱 업데이트'}</button>
      </div>
      <p className="mt-2">저장된 조사 결과와 첨부 사진은 유지됩니다. 입력 중인 내용은 먼저 건별 저장해 주세요.</p>
      {message && <p className="mt-2" role="status">{message}</p>}
      <details className="mt-2">
        <summary className="cursor-pointer">버전 정보</summary>
        <p className="mt-1">현재 버전: <span className="break-all">{buildId}</span></p>
        {builtAt && <p>반영 시각: {new Date(builtAt).toLocaleString('ko-KR')}</p>}
      </details>
    </footer>
  )
}
