import { useEffect, useState } from 'react'
import IosInstallGuide from './IosInstallGuide'

interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Capture at module load, before the page finishes rendering, so the browser's one-shot event is retained.
let pending: InstallPrompt | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    pending = event as InstallPrompt
    window.dispatchEvent(new Event('pwa-install-ready'))
  })
  window.addEventListener('appinstalled', () => { pending = null })
}

interface InstallBannerProps {
  /** Name of the home-screen icon, used in the guidance text. */
  appName: string
  title: string
  description: string
}

export default function InstallBanner({ appName, title, description }: InstallBannerProps) {
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  const [installed, setInstalled] = useState(standalone)
  const [available, setAvailable] = useState(Boolean(pending))
  const [busy, setBusy] = useState(false)
  const [help, setHelp] = useState(false)
  const [iosGuide, setIosGuide] = useState(false)
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  useEffect(() => {
    const ready = () => setAvailable(Boolean(pending))
    const done = () => { setInstalled(true); setAvailable(false) }
    const mode = window.matchMedia('(display-mode: standalone)')
    const changed = () => setInstalled(standalone())
    window.addEventListener('pwa-install-ready', ready)
    window.addEventListener('appinstalled', done)
    mode.addEventListener('change', changed)
    return () => {
      window.removeEventListener('pwa-install-ready', ready)
      window.removeEventListener('appinstalled', done)
      mode.removeEventListener('change', changed)
    }
  }, [])
  if (installed) return null
  const install = async () => {
    const prompt = pending
    // iOS cannot install programmatically; show the step-by-step guide pointing at the share button.
    if (!prompt && ios) { setIosGuide(true); return }
    if (!prompt) { setHelp(value => !value); return }
    pending = null
    setAvailable(false)
    setBusy(true)
    try {
      await prompt.prompt()
      await prompt.userChoice
      // Only appinstalled / standalone confirms installation, not prompt acceptance.
    } catch { setHelp(true) }
    finally { setBusy(false) }
  }
  return <section aria-label={`${appName} 앱 설치`} className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-caption">
    <div className="flex items-center justify-between gap-3">
      <div><p className="font-semibold">{title}</p><p className="text-on-surface-variant">{description}</p></div>
      <button type="button" disabled={busy} onClick={() => void install()} className="shrink-0 rounded-lg bg-primary px-3 py-2 font-semibold text-on-primary disabled:opacity-50">{available ? '앱 설치' : '홈 화면에 추가'}</button>
    </div>
    {help && <div className="mt-2 border-t border-primary/15 pt-2 text-on-surface-variant" role="status">
      {ios ? <p>Safari에서 공유(□↑) → ‘홈 화면에 추가’ → ‘추가’를 눌러주세요. ‘웹 앱으로 열기’가 보이면 켜주세요.</p>
        : <p>Chrome 또는 Edge의 메뉴(⋮)에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요.</p>}
      <p className="mt-1">카카오톡 등 앱 안에서 열었다면 메뉴에서 외부 브라우저로 열어주세요. 이미 설치했다면 홈 화면의 ‘{appName}’ 아이콘을 사용하세요.</p>
    </div>}
    {iosGuide && <IosInstallGuide appName={appName} onClose={() => setIosGuide(false)} />}
  </section>
}
