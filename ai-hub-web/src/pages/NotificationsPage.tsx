import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import {
  listNotifications,
  resolveNotification,
  updateNotificationStatus,
  deleteNotification,
  subscribeNotifications,
  type AppNotification,
} from '../lib/notificationService'
import { setUserAiLimit } from '../lib/aiUsageService'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '방금 전'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

function typeLabel(type: AppNotification['type']) {
  if (type === 'turn_request') return '턴 추가 요청'
  if (type === 'feedback') return '피드백'
  return '신고'
}

function typeBadge(type: AppNotification['type']) {
  if (type === 'turn_request') return 'bg-primary/10 text-primary'
  if (type === 'feedback') return 'bg-success/10 text-success'
  return 'bg-warning/10 text-warning'
}

function statusBadge(status: AppNotification['status']) {
  if (status === 'pending') return 'bg-warning/10 text-warning'
  if (status === 'resolved') return 'bg-success/10 text-success'
  return 'bg-surface-container-high text-on-surface-variant'
}

function statusLabel(status: AppNotification['status']) {
  if (status === 'pending') return '미처리'
  if (status === 'resolved') return '처리 완료'
  return '무시됨'
}

// ── 턴 요청 처리 패널 ─────────────────────────────────────────────────────────
function TurnRequestPanel({
  notification,
  onDone,
}: {
  notification: AppNotification
  onDone: () => void
}) {
  const [grantInput, setGrantInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleGrant = async () => {
    const extra = Math.max(0, Math.floor(Number(grantInput) || 0))
    if (extra <= 0) { setError('1 이상의 숫자를 입력하세요.'); return }
    setSaving(true)
    setError('')
    try {
      // 현재 userId의 limit 조회 후 extra 추가
      const { listAiUsage } = await import('../lib/aiUsageService')
      const usageMap = await listAiUsage([notification.userId])
      const current = usageMap[notification.userId]
      const newLimit = (current?.monthlyLimit ?? 5000) + extra
      await setUserAiLimit(notification.userId, newLimit)
      resolveNotification(notification.id, extra)
      setDone(true)
      setTimeout(onDone, 1200)
    } catch {
      setError('처리 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 text-success text-body-sm py-2">
        <Icon name="check_circle" className="text-[18px]" />
        턴이 추가되었습니다.
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-2">
      <p className="text-caption text-on-surface-variant">
        <span className="font-semibold text-on-surface">{notification.userName}</span> 님의 현재 한도에 추가할 턴 수를 입력하세요.
      </p>
      {notification.requestedTurns && (
        <p className="text-caption text-primary">요청 수량: {notification.requestedTurns.toLocaleString()}턴</p>
      )}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          value={grantInput}
          onChange={(e) => setGrantInput(e.target.value)}
          placeholder="추가 턴 수"
          className="h-8 w-32 rounded-lg border border-outline-variant bg-surface px-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
        <button
          type="button"
          onClick={() => void handleGrant()}
          disabled={saving}
          className="h-8 rounded-lg bg-primary px-3 text-label text-on-primary hover:bg-primary/90 disabled:opacity-60 flex items-center gap-1"
        >
          {saving ? <Icon name="progress_activity" className="animate-spin text-[15px]" /> : <Icon name="add" className="text-[15px]" />}
          턴 추가
        </button>
        <button
          type="button"
          onClick={() => { updateNotificationStatus(notification.id, 'dismissed'); onDone() }}
          className="h-8 rounded-lg border border-outline-variant px-3 text-label text-on-surface-variant hover:bg-surface-container-high"
        >
          무시
        </button>
      </div>
      {error && <p className="text-caption text-error">{error}</p>}
    </div>
  )
}

// ── 알림 카드 ─────────────────────────────────────────────────────────────────
function NotificationCard({
  notification,
  onRefresh,
}: {
  notification: AppNotification
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(notification.status === 'pending')
  const [showPanel, setShowPanel] = useState(false)

  return (
    <div
      className={`rounded-xl border transition-colors ${
        notification.status === 'pending'
          ? 'border-primary/30 bg-primary/3'
          : 'border-outline-variant bg-surface-container-lowest'
      }`}
    >
      {/* 헤더 */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* 타입 아이콘 */}
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${typeBadge(notification.type)}`}>
          <Icon
            name={
              notification.type === 'turn_request' ? 'token' :
              notification.type === 'feedback' ? 'chat_bubble' : 'flag'
            }
            className="text-[18px]"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-h3 text-[13px] text-on-surface truncate">{notification.subject}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${typeBadge(notification.type)}`}>
              {typeLabel(notification.type)}
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusBadge(notification.status)}`}>
              {statusLabel(notification.status)}
            </span>
          </div>
          <p className="text-caption text-on-surface-variant mt-0.5">
            {notification.userName} · {notification.appName} · {timeAgo(notification.createdAt)}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {notification.status === 'pending' && notification.type === 'turn_request' && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowPanel((v) => !v); setExpanded(true) }}
              className="h-7 rounded-lg bg-primary px-2.5 text-caption text-on-primary hover:bg-primary/90 flex items-center gap-1"
            >
              <Icon name="add" className="text-[14px]" />
              턴 처리
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); deleteNotification(notification.id); onRefresh() }}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error"
            title="삭제"
          >
            <Icon name="close" className="text-[15px]" />
          </button>
          <Icon name={expanded ? 'expand_less' : 'expand_more'} className="text-[18px] text-on-surface-variant" />
        </div>
      </div>

      {/* 상세 */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-outline-variant/50 pt-3 space-y-2">
          <p className="text-body-sm text-on-surface whitespace-pre-wrap leading-relaxed">{notification.message}</p>
          {notification.grantedTurns !== undefined && (
            <p className="text-caption text-success">✓ {notification.grantedTurns.toLocaleString()}턴 지급됨</p>
          )}
          {showPanel && notification.type === 'turn_request' && notification.status === 'pending' && (
            <TurnRequestPanel
              notification={notification}
              onDone={() => { setShowPanel(false); onRefresh() }}
            />
          )}
          {notification.status === 'pending' && notification.type !== 'turn_request' && (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { resolveNotification(notification.id); onRefresh() }}
                className="h-7 rounded-lg bg-success/10 text-success px-3 text-label hover:bg-success/20 flex items-center gap-1"
              >
                <Icon name="check" className="text-[14px]" />
                처리 완료
              </button>
              <button
                type="button"
                onClick={() => { updateNotificationStatus(notification.id, 'dismissed'); onRefresh() }}
                className="h-7 rounded-lg border border-outline-variant px-3 text-label text-on-surface-variant hover:bg-surface-container-high"
              >
                무시
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved' | 'dismissed'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'turn_request' | 'feedback' | 'report'>('all')

  const refresh = useCallback(() => {
    setNotifications(listNotifications())
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    return subscribeNotifications(refresh)
  }, [refresh])

  const filtered = notifications.filter((n) => {
    if (filter !== 'all' && n.status !== filter) return false
    if (typeFilter !== 'all' && n.type !== typeFilter) return false
    return true
  })

  const pendingCount = notifications.filter((n) => n.status === 'pending').length
  const turnRequests = notifications.filter((n) => n.type === 'turn_request' && n.status === 'pending').length

  return (
    <main className="min-h-[calc(100vh-60px)] p-6 overflow-y-auto custom-scrollbar bg-surface-bright">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="font-h1 text-h1 text-on-surface tracking-tight flex items-center gap-2">
            알림
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full bg-error text-white text-[11px] font-bold">
                {pendingCount}
              </span>
            )}
          </h1>
          <p className="text-body-sm text-on-surface-variant mt-1">
            앱에서 사용자가 남긴 피드백·요청사항을 확인하고 조치합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="bg-primary text-on-primary font-h3 text-h3 px-5 py-3 rounded-lg flex items-center gap-2 hover:opacity-90 transition-all shadow-md"
        >
          <Icon name="refresh" />
          새로고침
        </button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: '전체', value: notifications.length, icon: 'notifications', tone: 'text-primary bg-primary/10' },
          { label: '미처리', value: pendingCount, icon: 'pending', tone: 'text-warning bg-warning/10' },
          { label: '턴 요청', value: turnRequests, icon: 'token', tone: 'text-tertiary bg-tertiary/10' },
          { label: '처리 완료', value: notifications.filter((n) => n.status === 'resolved').length, icon: 'check_circle', tone: 'text-success bg-success/10' },
        ].map((item) => (
          <div key={item.label} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 shadow-sm">
            <div className={`inline-flex p-2 rounded-lg mb-3 ${item.tone}`}>
              <Icon name={item.icon} />
            </div>
            <p className="text-on-surface-variant font-label text-label uppercase tracking-widest mb-0.5">{item.label}</p>
            <p className="text-display font-display text-on-surface">{item.value}</p>
          </div>
        ))}
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="inline-flex rounded-lg border border-outline-variant bg-surface p-0.5">
          {(['all', 'pending', 'resolved', 'dismissed'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`h-8 px-3 rounded text-caption font-medium transition-colors ${
                filter === s ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {s === 'all' ? '전체' : s === 'pending' ? '미처리' : s === 'resolved' ? '완료' : '무시'}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-outline-variant bg-surface p-0.5">
          {(['all', 'turn_request', 'feedback', 'report'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`h-8 px-3 rounded text-caption font-medium transition-colors ${
                typeFilter === t ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {t === 'all' ? '전체 유형' : t === 'turn_request' ? '턴 요청' : t === 'feedback' ? '피드백' : '신고'}
            </button>
          ))}
        </div>
      </div>

      {/* 알림 목록 */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest py-16 text-center">
          <Icon name="notifications_none" className="text-[36px] text-on-surface-variant mb-3" />
          <p className="font-h3 text-h3 text-on-surface">알림이 없습니다</p>
          <p className="text-body-sm text-on-surface-variant mt-1">사용자가 요청이나 피드백을 남기면 여기에 표시됩니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => (
            <NotificationCard key={n.id} notification={n} onRefresh={refresh} />
          ))}
        </div>
      )}
    </main>
  )
}
