// 원격 앱 관리 — 공동 마켓플레이스에 앱 번들을 올리고 내린다. (관리자 전용)
//
// 여기서 올린 앱은 허브를 다시 빌드하지 않고 실행 중에 등록된다.
// 앱 번들 규격과 예제는 doc/REMOTE_APPS.md 참고.

import { useState } from 'react'
import { Icon } from './Icon'
import { useAppCatalog } from '../context/AppCatalogContext'
import { deleteRemoteApp, uploadRemoteApp } from '../apps/remoteApps'

const CATEGORIES = ['생산성', '운영', 'AI', '코어'] as const

export default function RemoteAppManager() {
  const { remoteApps, remoteLoading, reloadRemoteApps } = useAppCatalog()
  const [open, setOpen] = useState(false)
  const [bundle, setBundle] = useState<File | null>(null)
  const [form, setForm] = useState({
    id: '', name: '', icon: 'extension', description: '',
    category: '생산성', version: '1.0.0', author: '', license: 'MIT', sourceUrl: '',
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    if (!bundle) { setMsg({ tone: 'error', text: '앱 번들(.js) 파일을 선택하세요.' }); return }
    if (!form.id.trim() || !form.name.trim()) {
      setMsg({ tone: 'error', text: '앱 id와 이름은 필수입니다.' }); return
    }
    setBusy(true)
    setMsg(null)
    try {
      const res = await uploadRemoteApp({ bundle, ...form })
      if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? '업로드 실패' }); return }
      setMsg({ tone: 'ok', text: `${form.name} 등록 완료 — 마켓플레이스에 나타납니다.` })
      setBundle(null)
      setForm((f) => ({ ...f, id: '', name: '', description: '' }))
      setOpen(false)
      await reloadRemoteApps()
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`${name} 앱을 마켓플레이스에서 삭제할까요?\n\n설치한 사용자의 화면에서도 사라집니다.`)) return
    setBusy(true)
    try {
      const res = await deleteRemoteApp(id)
      setMsg(res.ok
        ? { tone: 'ok', text: `${name} 삭제됨` }
        : { tone: 'error', text: res.error ?? '삭제 실패' })
      await reloadRemoteApps()
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full rounded-lg border border-outline-variant bg-surface px-2.5 py-1.5 text-body-sm outline-none focus:border-primary'

  return (
    <section className="mt-8 rounded-xl border border-outline-variant bg-surface-container-low p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon name="cloud_upload" className="text-[20px] text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="font-body-sm text-body-sm font-semibold text-on-surface">원격 앱 (공동 마켓플레이스)</h2>
          <p className="text-caption text-on-surface-variant">
            앱 번들을 올리면 허브를 다시 빌드하지 않고 실행 중에 등록됩니다.
          </p>
        </div>
        <button type="button" onClick={() => void reloadRemoteApps()} disabled={remoteLoading}
          className="shrink-0 rounded-lg border border-outline-variant px-2.5 py-1.5 text-label hover:bg-surface-container-high disabled:opacity-50">
          <Icon name={remoteLoading ? 'progress_activity' : 'refresh'} className={`text-[16px] ${remoteLoading ? 'animate-spin' : ''}`} />
        </button>
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-label text-on-primary hover:bg-primary/90">
          <Icon name={open ? 'close' : 'add'} className="mr-1 text-[16px]" />
          {open ? '닫기' : '앱 올리기'}
        </button>
      </div>

      {msg && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-caption ${
          msg.tone === 'ok' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
        }`}>{msg.text}</p>
      )}

      {open && (
        <div className="mb-4 space-y-3 rounded-lg border border-primary/25 bg-primary/5 p-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-outline-variant px-3 py-3 hover:border-primary/50">
            <Icon name="code" className="text-[20px] text-on-surface-variant" />
            <span className="min-w-0 flex-1 truncate text-body-sm text-on-surface">
              {bundle ? `${bundle.name} · ${(bundle.size / 1024).toFixed(0)} KB` : '앱 번들 파일 선택 (.js)'}
            </span>
            <input type="file" accept=".js,.mjs" className="hidden"
              onChange={(e) => { setBundle(e.target.files?.[0] ?? null); e.target.value = '' }} />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-caption text-on-surface-variant">앱 id *</span>
              <input value={form.id} onChange={set('id')} placeholder="hello-world" className={field} />
            </label>
            <label className="block">
              <span className="text-caption text-on-surface-variant">이름 *</span>
              <input value={form.name} onChange={set('name')} placeholder="인사 앱" className={field} />
            </label>
            <label className="block">
              <span className="text-caption text-on-surface-variant">아이콘 (Material Symbols)</span>
              <input value={form.icon} onChange={set('icon')} placeholder="waving_hand" className={field} />
            </label>
            <label className="block">
              <span className="text-caption text-on-surface-variant">분류</span>
              <select value={form.category} onChange={set('category')} className={field}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="col-span-2 block">
              <span className="text-caption text-on-surface-variant">설명</span>
              <input value={form.description} onChange={set('description')} className={field} />
            </label>
            <label className="block">
              <span className="text-caption text-on-surface-variant">버전</span>
              <input value={form.version} onChange={set('version')} className={field} />
            </label>
            <label className="block">
              <span className="text-caption text-on-surface-variant">만든 이</span>
              <input value={form.author} onChange={set('author')} className={field} />
            </label>
            <label className="block">
              <span className="text-caption text-on-surface-variant">라이선스</span>
              <input value={form.license} onChange={set('license')} className={field} />
            </label>
            <label className="block">
              <span className="text-caption text-on-surface-variant">소스 저장소</span>
              <input value={form.sourceUrl} onChange={set('sourceUrl')} placeholder="https://github.com/..." className={field} />
            </label>
          </div>

          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-warning">
            <Icon name="warning" className="mt-0.5 shrink-0 text-[13px]" />
            원격 앱 코드는 허브와 같은 권한으로 브라우저에서 실행됩니다.
            소스를 확인한 앱만 올리세요.
          </p>

          <button type="button" onClick={() => void submit()} disabled={busy}
            className="w-full rounded-lg bg-primary py-2 text-body-sm font-medium text-on-primary hover:bg-primary/90 disabled:opacity-50">
            {busy ? '올리는 중...' : '마켓플레이스에 등록'}
          </button>
        </div>
      )}

      {remoteApps.length === 0 ? (
        <p className="py-4 text-center text-caption text-on-surface-variant">
          등록된 원격 앱이 없습니다. 만드는 방법은 <code className="rounded bg-surface-container-high px-1">doc/REMOTE_APPS.md</code> 를 보세요.
        </p>
      ) : (
        <div className="space-y-1.5">
          {remoteApps.map(({ meta, plugin, error }) => (
            <div key={meta.id} className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-3 py-2">
              <Icon name={plugin ? meta.icon || 'extension' : 'error'}
                className={`shrink-0 text-[20px] ${plugin ? 'text-primary' : 'text-error'}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-medium text-on-surface">
                  {meta.name} <span className="text-caption text-on-surface-variant">v{meta.version}</span>
                </p>
                <p className="truncate text-caption text-on-surface-variant">
                  {meta.id} · {meta.category} · {(meta.size / 1024).toFixed(0)} KB
                  {meta.license && <> · {meta.license}</>}
                  {meta.author && <> · {meta.author}</>}
                </p>
                {error && <p className="mt-0.5 text-caption text-error">불러오기 실패: {error}</p>}
              </div>
              <span className="shrink-0 font-mono text-[10px] text-on-surface-variant/60" title={`SHA-256 ${meta.sha256}`}>
                {meta.sha256.slice(0, 8)}
              </span>
              <button type="button" onClick={() => void remove(meta.id, meta.name)} disabled={busy}
                title="마켓플레이스에서 삭제"
                className="shrink-0 rounded p-1 text-on-surface-variant hover:bg-error/10 hover:text-error disabled:opacity-50">
                <Icon name="delete" className="text-[18px]" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
