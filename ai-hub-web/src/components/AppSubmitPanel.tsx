// 앱 제출 — 누구나 만든 앱을 마켓플레이스에 낼 수 있다.
//
// 제출한다고 바로 배포되지는 않는다. 관리자가 코드를 읽고 승인해야 다른 사람에게 간다.
// 그 전에 「로컬 미리보기」로 내 화면에서 먼저 돌려 볼 수 있다 — 서버에 아무것도 올라가지 않는다.
//
// 만드는 방법은 doc/REMOTE_APPS.md, 템플릿은 examples/app-template/ 참고.

import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useAppCatalog } from '../context/AppCatalogContext'
import {
  fetchMySubmissions,
  loadLocalPreview,
  parseAppPackage,
  submitRemoteApp,
  PERMISSION_LABELS,
  REMOTE_APP_PERMISSIONS,
  STATUS_LABELS,
  type RemoteAppMeta,
  type RemoteAppPermission,
  type RemoteAppStatus,
} from '../apps/remoteApps'

const CATEGORIES = ['생산성', '운영', 'AI'] as const

function StatusChip({ status }: { status?: RemoteAppStatus }) {
  if (!status) return null
  const tone =
    status === 'approved' ? 'bg-success/10 text-success'
    : status === 'pending' ? 'bg-warning/10 text-warning'
    : status === 'suspended' ? 'bg-error/10 text-error'
    : 'bg-surface-container-high text-on-surface-variant'
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${tone}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export default function AppSubmitPanel() {
  const { previewApp, setPreviewApp } = useAppCatalog()
  const [open, setOpen] = useState(false)
  const [bundle, setBundle] = useState<File | null>(null)
  const [form, setForm] = useState({
    id: '', name: '', icon: 'extension', description: '',
    category: '생산성', version: '1.0.0', author: '', license: 'MIT', sourceUrl: '',
    submitNote: '',
  })
  const [permissions, setPermissions] = useState<RemoteAppPermission[]>([])
  /** 제출용 패키지를 골랐으면 폼을 채울 필요가 없다. */
  const [fromPackage, setFromPackage] = useState(false)
  const [mine, setMine] = useState<RemoteAppMeta[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))

  const loadMine = useCallback(async () => {
    setMine(await fetchMySubmissions())
  }, [])

  // setState 는 await 이후에 일어나지만 규칙이 호출을 따라 들어가 오탐합니다.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadMine() }, [loadMine])

  /**
   * 번들 파일을 고른다.
   *
   * 제출용 패키지(.aihubapp.json)면 안의 메타데이터로 폼을 채운다 —
   * 빌드가 만들어 준 값이라 사람이 다시 옮겨 적을 이유가 없다.
   */
  const pickBundle = async (file: File | null) => {
    setBundle(file)
    setFromPackage(false)
    if (!file) return
    const pkg = parseAppPackage(await file.text())
    if (!pkg) return
    const a = pkg.app
    setForm((f) => ({
      ...f,
      id: a.id ?? f.id,
      name: a.name ?? f.name,
      icon: a.icon || f.icon,
      description: a.description ?? f.description,
      category: a.category ?? f.category,
      version: a.version ?? f.version,
      author: a.author ?? f.author,
      license: a.license ?? f.license,
      sourceUrl: a.sourceUrl ?? f.sourceUrl,
    }))
    setPermissions(a.permissions ?? [])
    setFromPackage(true)
    setMsg({ tone: 'ok', text: '파일에 담긴 정보로 아래 항목을 채웠습니다. 필요하면 고치세요.' })
  }

  const togglePermission = (p: RemoteAppPermission) =>
    setPermissions((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]))

  /** 제출 전에 내 화면에서만 띄워 본다. 서버로 가지 않는다. */
  const preview = async (file: File | null) => {
    if (!file) return
    setMsg(null)
    const result = await loadLocalPreview(file)
    if (result.error) {
      setMsg({ tone: 'error', text: `미리보기 실패: ${result.error}` })
      return
    }
    setPreviewApp(result)
    setMsg({
      tone: 'ok',
      text: '대시보드에서 «앱 추가»를 열면 [미리보기] 항목이 있습니다. 새로고침하면 사라집니다.',
    })
  }

  const submit = async () => {
    if (!bundle) { setMsg({ tone: 'error', text: '앱 파일을 선택하세요.' }); return }
    if (!form.id.trim() || !form.name.trim()) {
      setMsg({ tone: 'error', text: '앱 id와 이름은 필수입니다.' }); return
    }
    setBusy(true)
    setMsg(null)
    try {
      const res = await submitRemoteApp({ bundle, ...form, permissions })
      if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? '제출 실패' }); return }
      setMsg({
        tone: 'ok',
        text: `${form.name} 제출 완료 — 관리자가 승인하면 마켓플레이스에 등록됩니다.`,
      })
      setBundle(null)
      setFromPackage(false)
      setForm((f) => ({ ...f, id: '', name: '', description: '', submitNote: '' }))
      setPermissions([])
      setOpen(false)
      await loadMine()
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full rounded-lg border border-outline-variant bg-surface px-2.5 py-1.5 text-body-sm outline-none focus:border-primary'

  return (
    <section className="mt-8 rounded-xl border border-outline-variant bg-surface-container-low p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon name="upload_file" className="text-[20px] text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="font-body-sm text-body-sm font-semibold text-on-surface">내 앱 제출</h2>
          <p className="text-caption text-on-surface-variant">
            직접 만든 앱을 마켓플레이스에 낼 수 있습니다. 관리자 승인 후 다른 사람도 쓰게 됩니다.
            만드는 방법은 <code className="rounded bg-surface-container-high px-1">doc/REMOTE_APPS.md</code> 를 보세요.
          </p>
        </div>
        <label className="shrink-0 cursor-pointer rounded-lg border border-outline-variant px-3 py-1.5 text-label text-on-surface-variant hover:bg-surface-container-high"
          title="제출하지 않고 내 화면에서만 띄워 봅니다">
          <Icon name="visibility" className="mr-1 text-[16px]" />
          로컬 미리보기
          <input type="file" accept=".json,.aihubapp.json,.js,.mjs" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0] ?? null; e.target.value = ''; void preview(f) }} />
        </label>
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-label text-on-primary hover:bg-primary/90">
          <Icon name={open ? 'close' : 'add'} className="mr-1 text-[16px]" />
          {open ? '닫기' : '앱 제출'}
        </button>
      </div>

      {previewApp?.plugin && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <Icon name="visibility" className="shrink-0 text-[18px] text-primary" />
          <p className="min-w-0 flex-1 truncate text-caption text-on-surface">
            미리보기 중: <span className="font-medium">{previewApp.meta.name}</span>
            <span className="text-on-surface-variant"> — 나만 보이며 서버에 올라가지 않았습니다.</span>
          </p>
          <button type="button" onClick={() => setPreviewApp(null)}
            className="shrink-0 rounded p-1 text-on-surface-variant hover:bg-error/10 hover:text-error">
            <Icon name="close" className="text-[16px]" />
          </button>
        </div>
      )}

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
              {bundle
                ? `${bundle.name} · ${(bundle.size / 1024).toFixed(0)} KB`
                : '앱 파일 선택 (.aihubapp.json 또는 .js)'}
            </span>
            <input type="file" accept=".json,.aihubapp.json,.js,.mjs" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0] ?? null; e.target.value = ''; void pickBundle(f) }} />
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

          <div>
            <p className="mb-1 text-caption text-on-surface-variant">
              이 앱이 접근하는 것 — 심사자가 무엇을 확인할지 알려 줍니다. 빠뜨리면 반려될 수 있습니다.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {REMOTE_APP_PERMISSIONS.map((p) => (
                <button key={p} type="button" onClick={() => togglePermission(p)}
                  className={`rounded-lg px-2.5 py-1 text-caption ${
                    permissions.includes(p)
                      ? 'bg-primary text-on-primary'
                      : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                  }`}>
                  {PERMISSION_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-caption text-on-surface-variant">
              심사자에게 남기는 말 — 무엇을 하는 앱인지, 왜 이 접근이 필요한지
            </span>
            <textarea value={form.submitNote} onChange={set('submitNote')} rows={2} className={field}
              placeholder="예: 사내 공지를 모아 보여 줍니다. 공지 API를 읽기 위해 허브 API 호출이 필요합니다." />
          </label>

          {fromPackage && (
            <p className="flex items-start gap-1.5 rounded-lg bg-success/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-success">
              <Icon name="task_alt" className="mt-0.5 shrink-0 text-[13px]" />
              제출용 파일에서 정보를 읽었습니다. 그대로 «심사 요청»을 누르시면 됩니다.
            </p>
          )}

          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-on-surface-variant">
            <Icon name="info" className="mt-0.5 shrink-0 text-[13px]" />
            제출한 코드는 관리자가 전부 읽습니다. 승인되면 마켓플레이스에 등록되어
            다른 사용자가 설치할 수 있게 됩니다.
          </p>

          <button type="button" onClick={() => void submit()} disabled={busy}
            className="w-full rounded-lg bg-primary py-2 text-body-sm font-medium text-on-primary hover:bg-primary/90 disabled:opacity-50">
            {busy ? '제출하는 중...' : '심사 요청'}
          </button>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-caption font-medium text-on-surface">내 제출 현황</p>
        {mine.length === 0 ? (
          <p className="py-3 text-center text-caption text-on-surface-variant">아직 제출한 앱이 없습니다.</p>
        ) : (
          <div className="space-y-1.5">
            {mine.map((r) => (
              <div key={r.versionId} className="rounded-lg border border-outline-variant bg-surface px-3 py-2">
                <div className="flex items-center gap-2">
                  <Icon name={r.icon || 'extension'} className="shrink-0 text-[18px] text-on-surface-variant" />
                  <p className="min-w-0 flex-1 truncate text-body-sm text-on-surface">
                    {r.name} <span className="text-caption text-on-surface-variant">v{r.version}</span>
                  </p>
                  <StatusChip status={r.status} />
                </div>
                {r.reviewNote && (
                  <p className={`mt-1 whitespace-pre-wrap text-caption ${
                    r.status === 'rejected' ? 'text-error' : 'text-on-surface-variant'
                  }`}>
                    심사 의견: {r.reviewNote}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
