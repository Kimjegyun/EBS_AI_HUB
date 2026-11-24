import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import type { AppContext } from './types'

interface Props { code: string; appId: string; permissions: string[]; context: AppContext }

export default function SandboxedRemoteApp({ code, appId, permissions, context }: Props) {
  const frame = useRef<HTMLIFrameElement>(null)
  const latestContext = useRef(context)
  useEffect(() => { latestContext.current = context }, [context])
  const { session } = useAuth()
  const storageKey = `aihub-sandbox:${session?.userId || session?.email || 'preview'}:${appId}`
  const [error, setError] = useState('')
  const [channel] = useState(() => crypto.randomUUID())
  const network = permissions.includes('network')
  const storage = permissions.includes('storage')
  const runtime = new URL(`${import.meta.env.BASE_URL}remote-app-runtime.js`, location.origin).href
  const csp = `default-src 'none'; script-src ${location.origin} blob:; style-src ${location.origin} 'unsafe-inline'; img-src data: blob: ${network ? 'https:' : ''}; connect-src ${network ? 'https:' : "'none'"}; base-uri 'none'; form-action 'none'`
  const styles = Array.from(window.document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .filter((link) => new URL(link.href).origin === location.origin)
    .map((link) => `<link rel="stylesheet" href="${link.href.replaceAll('"', '&quot;')}">`).join('')
  const frameDocument = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer">${styles}<style>body{margin:0;font-family:system-ui,sans-serif;color:#111827}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="${runtime}"></script></body></html>`
  useEffect(() => {
    const send = () => {
      let values = {}
      if (storage) { try { values = JSON.parse(localStorage.getItem(storageKey) || '{}') } catch { /* Invalid app-scoped data is ignored. */ } }
      frame.current?.contentWindow?.postMessage({ type: 'aihub:init', channel, code, context: { isAdmin: context.isAdmin, maximized: context.maximized }, storage: storage ? values : null }, '*')
    }
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return
      const data = event.data
      if (data?.type === 'aihub:ready') { send(); return }
      if (data?.channel !== channel) return
      if (data.type === 'aihub:error') setError(String(data.message).slice(0, 500))
      if (data.type === 'aihub:toggle') latestContext.current.toggleMaximize()
      if (data.type === 'aihub:remove') latestContext.current.remove()
      if (data.type === 'aihub:storage' && storage && data.values && typeof data.values === 'object') {
        const encoded = JSON.stringify(data.values)
        if (encoded.length <= 65536 && Object.keys(data.values).length <= 100) {
          try { localStorage.setItem(storageKey, encoded) } catch { /* Storage quotas must not affect the hub. */ }
        }
      }
    }
    window.addEventListener('message', receive)
    send()
    return () => window.removeEventListener('message', receive)
  }, [channel, code, storage, storageKey, context.isAdmin, context.maximized])
  return <div className="h-full min-h-40 w-full">
    {error && <p role="alert" className="p-3 text-sm text-error">앱 실행 오류: {error}</p>}
    <iframe ref={frame} title={appId} sandbox="allow-scripts allow-downloads" referrerPolicy="no-referrer" srcDoc={frameDocument} className="h-full min-h-40 w-full border-0" />
  </div>
}
