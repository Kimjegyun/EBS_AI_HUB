// 앱 심사 대기열 — 사용자가 제출한 앱을 관리자가 읽고 승인하거나 반려한다. (관리자 전용)
//
// 원격 앱 코드는 허브와 같은 권한으로 브라우저에서 실행된다. 격리(샌드박스)가 없으므로
// 여기서 코드를 실제로 읽는 것이 유일한 방어선이다. 승인 버튼을 누르기 전에 코드를 펼쳐 보라.
//
// 자세한 흐름은 doc/REMOTE_APPS.md 참고.

import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useAppCatalog } from '../context/AppCatalogContext'
import {
  fetchSubmissions,
  fetchVersionCode,
  reviewVersion,
  PERMISSION_LABELS,
  STATUS_LABELS,
  type RemoteAppMeta,
  type RemoteAppStatus,
  type VersionCode,
} from '../apps/remoteApps'

const TABS: Array<{ key: RemoteAppStatus | 'all'; label: string }> = [
  { key: 'pending', label: '심사 대기' },
  { key: 'all', label: '전체 이력' },
]

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

export default function AppReviewQueue() {
  const { reloadRemoteApps } = useAppCatalog()
  const [tab, setTab] = useState<RemoteAppStatus | 'all'>('pending')
  const [rows, setRows] = useState<RemoteAppMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [detail, setDetail] = useState<VersionCode | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await fetchSubmissions(tab))
    } finally {
      setLoading(false)
    }
  }, [tab])

  // setState 는 모두 await 이후에 일어나지만 규칙이 호출을 따라 들어가 오탐합니다.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  /** 코드를 펼친다. 승인 전에 반드시 읽어야 하는 부분이다. */
  const openDetail = async (versionId: number) => {
    if (openId === versionId) {
      setOpenId(null)
      setDetail(null)
      return
    }
    setOpenId(versionId)
    setDetail(null)
    setDetailError(null)
    setNote('')
    const res = await fetchVersionCode(versionId)
    if (!res.ok) { setDetailError(res.error ?? '코드를 읽지 못했습니다.'); return }
    setDetail(res.data ?? null)
  }

  const decide = async (versionId: number, action: 'approve' | 'reject') => {
    if (action === 'reject' && !note.trim()) {
      setMsg({ tone: 'error', text: '반려 사유를 적어 주세요. 제출자에게 그대로 전달됩니다.' })
      return
    }
    if (action === 'approve' && !window.confirm(
      '이 버전을 승인하면 마켓플레이스에 등록되어 모든 사용자가 설치할 수 있게 됩니다.\n\n' +
      '원격 앱 코드는 허브와 같은 권한으로 실행되며 샌드박스가 없습니다.\n' +
      '코드를 직접 확인하셨습니까?',
    )) return

    setBusy(true)
    try {
      const res = await reviewVersion(versionId, action, note.trim())
      if (!res.ok) { setMsg({ tone: 'error', text: res.error ?? '처리 실패' }); return }
      setMsg({
        tone: 'ok',
        text: action === 'approve'
          ? '승인 완료 — 마켓플레이스에 등록되었습니다. 사용자가 «사용하기»로 설치합니다.'
          : '반려했습니다. 제출자에게 사유가 전달됩니다.',
      })
      setOpenId(null)
      setDetail(null)
      setNote('')
      await load()
      await reloadRemoteApps()
    } finally {
      setBusy(false)
    }
  }

  const pendingCount = rows.filter((r) => r.status === 'pending').length

  return (
    <section className="mt-8 rounded-xl border border-outline-variant bg-surface-container-low p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon name="rate_review" className="text-[20px] text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="font-body-sm text-body-sm font-semibold text-on-surface">
            앱 심사
            {pendingCount > 0 && (
              <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] text-warning">
                대기 {pendingCount}
              </span>
            )}
          </h2>
          <p className="text-caption text-on-surface-variant">
            사용자가 제출한 앱입니다. 승인하면 마켓플레이스에 등록됩니다.
            승인 전 코드는 아무에게도 나가지 않습니다.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="shrink-0 rounded-lg border border-outline-variant px-2.5 py-1.5 text-label hover:bg-surface-container-high disabled:opacity-50">
          <Icon name={loading ? 'progress_activity' : 'refresh'}
            className={`text-[16px] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="mb-3 flex gap-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1 text-label ${
              tab === t.key
                ? 'bg-primary text-on-primary'
                : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-caption ${
          msg.tone === 'ok' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
        }`}>{msg.text}</p>
      )}

      {rows.length === 0 ? (
        <p className="py-4 text-center text-caption text-on-surface-variant">
          {tab === 'pending' ? '심사할 앱이 없습니다.' : '제출 이력이 없습니다.'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.versionId} className="rounded-lg border border-outline-variant bg-surface">
              <div className="flex items-center gap-2 px-3 py-2">
                <Icon name={r.icon || 'extension'} className="shrink-0 text-[20px] text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-medium text-on-surface">
                    {r.name} <span className="text-caption text-on-surface-variant">v{r.version}</span>
                  </p>
                  <p className="truncate text-caption text-on-surface-variant">
                    {r.id} · {r.category} · {(r.size / 1024).toFixed(0)} KB
                    {r.submittedByName && <> · {r.submittedByName}</>}
                  </p>
                </div>
                <StatusChip status={r.status} />
                <button type="button" onClick={() => void openDetail(r.versionId!)}
                  className="shrink-0 rounded-lg border border-outline-variant px-2.5 py-1 text-label text-on-surface-variant hover:bg-surface-container-high">
                  <Icon name={openId === r.versionId ? 'expand_less' : 'code'} className="mr-1 text-[15px]" />
                  {openId === r.versionId ? '닫기' : '코드 보기'}
                </button>
              </div>

              {openId === r.versionId && (
                <div className="space-y-3 border-t border-outline-variant px-3 py-3">
                  {detailError && <p className="text-caption text-error">{detailError}</p>}
                  {!detail && !detailError && (
                    <p className="text-caption text-on-surface-variant">코드를 불러오는 중...</p>
                  )}

                  {detail && (
                    <>
                      {detail.version.submitNote && (
                        <div>
                          <p className="mb-1 text-caption font-medium text-on-surface">제출자 설명</p>
                          <p className="whitespace-pre-wrap rounded-lg bg-surface-container-high px-3 py-2 text-caption text-on-surface-variant">
                            {detail.version.submitNote}
                          </p>
                        </div>
                      )}

                      <div>
                        <p className="mb-1 text-caption font-medium text-on-surface">선언한 접근 범위</p>
                        {detail.version.permissions?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {detail.version.permissions.map((p) => (
                              <span key={p} className="rounded bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                                {PERMISSION_LABELS[p]}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-caption text-on-surface-variant">선언한 것 없음</p>
                        )}
                      </div>

                      {detail.flags.length > 0 && (
                        <div className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2">
                          <p className="mb-1 flex items-center gap-1 text-caption font-medium text-warning">
                            <Icon name="warning" className="text-[14px]" />
                            확인이 필요한 지점
                          </p>
                          <ul className="ml-4 list-disc text-caption text-on-surface-variant">
                            {detail.flags.map((f) => <li key={f}>{f}</li>)}
                          </ul>
                          <p className="mt-1 text-[11px] text-on-surface-variant/70">
                            자동 검사는 우회하기 쉽습니다. 아래 코드를 직접 확인하세요.
                          </p>
                        </div>
                      )}

                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-caption font-medium text-on-surface">번들 코드</p>
                          <span className="font-mono text-[10px] text-on-surface-variant/60"
                            title={`SHA-256 ${detail.version.sha256}`}>
                            {detail.version.sha256.slice(0, 12)}
                          </span>
                        </div>
                        <pre className="max-h-96 overflow-auto rounded-lg bg-surface-container-high p-3 font-mono text-[11px] leading-relaxed text-on-surface">
                          {detail.code}
                        </pre>
                      </div>

                      {r.status === 'pending' && (
                        <>
                          <label className="block">
                            <span className="text-caption text-on-surface-variant">
                              심사 의견 (반려 시 필수 — 제출자에게 그대로 전달됩니다)
                            </span>
                            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                              className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-2.5 py-1.5 text-body-sm outline-none focus:border-primary"
                              placeholder="예: fetch 로 외부 도메인을 호출하는데 network 를 선언하지 않았습니다." />
                          </label>
                          <div className="flex gap-2">
                            <button type="button" disabled={busy}
                              onClick={() => void decide(r.versionId!, 'approve')}
                              className="flex-1 rounded-lg bg-primary py-2 text-body-sm font-medium text-on-primary hover:bg-primary/90 disabled:opacity-50">
                              승인 · 마켓플레이스 등록
                            </button>
                            <button type="button" disabled={busy}
                              onClick={() => void decide(r.versionId!, 'reject')}
                              className="flex-1 rounded-lg border border-error/50 py-2 text-body-sm font-medium text-error hover:bg-error/10 disabled:opacity-50">
                              반려
                            </button>
                          </div>
                        </>
                      )}

                      {r.status !== 'pending' && r.reviewNote && (
                        <div>
                          <p className="mb-1 text-caption font-medium text-on-surface">
                            심사 의견 {r.reviewedByName && <>· {r.reviewedByName}</>}
                          </p>
                          <p className="whitespace-pre-wrap rounded-lg bg-surface-container-high px-3 py-2 text-caption text-on-surface-variant">
                            {r.reviewNote}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
