// 앱 내 알림 서비스 — 사용자 피드백/요청 → admin 알림 처리
// localStorage 기반, Supabase 연동 시 교체 가능

import { getPortalScopedItem, setPortalScopedItem } from './portalStorage'

const NOTIFICATIONS_KEY = 'ai-hub-notifications-v1'
const GLOBAL_TURNS_KEY = 'ai-hub-global-turns-v1'

export type NotificationType = 'turn_request' | 'feedback' | 'report'
export type NotificationStatus = 'pending' | 'resolved' | 'dismissed'

export type AppNotification = {
  id: string
  type: NotificationType
  status: NotificationStatus
  createdAt: string
  resolvedAt?: string
  // 발신자 정보
  userId: string
  userName: string
  userEmail: string
  // 내용
  appId: string
  appName: string
  subject: string
  message: string
  // turn_request 전용
  requestedTurns?: number
  grantedTurns?: number
}

function readAll(): AppNotification[] {
  try {
    const raw = getPortalScopedItem(NOTIFICATIONS_KEY)
    return raw ? (JSON.parse(raw) as AppNotification[]) : []
  } catch {
    return []
  }
}

function writeAll(items: AppNotification[]): void {
  setPortalScopedItem(NOTIFICATIONS_KEY, JSON.stringify(items))
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// ── 공개 API ──────────────────────────────────────────────────────────────────

/** 새 알림 추가 (사용자가 호출) */
export function addNotification(
  params: Omit<AppNotification, 'id' | 'status' | 'createdAt'>,
): AppNotification {
  const item: AppNotification = {
    ...params,
    id: makeId(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
  const all = readAll()
  // 같은 userId + type + appId로 pending 중복 방지 (turn_request)
  const filtered = all.filter(
    (n) =>
      !(n.userId === item.userId && n.type === item.type && n.appId === item.appId && n.status === 'pending'),
  )
  writeAll([item, ...filtered].slice(0, 200))
  // 브라우저 스토리지 이벤트로 admin 탭에 알림 (같은 도메인 다른 탭)
  window.dispatchEvent(new StorageEvent('storage', { key: NOTIFICATIONS_KEY }))
  return item
}

/** 전체 알림 목록 조회 */
export function listNotifications(filter?: { status?: NotificationStatus; type?: NotificationType }): AppNotification[] {
  const all = readAll()
  return all.filter((n) => {
    if (filter?.status && n.status !== filter.status) return false
    if (filter?.type && n.type !== filter.type) return false
    return true
  })
}

/** 알림 상태 변경 */
export function updateNotificationStatus(id: string, status: NotificationStatus): void {
  const all = readAll()
  writeAll(
    all.map((n) =>
      n.id === id ? { ...n, status, resolvedAt: status === 'resolved' ? new Date().toISOString() : n.resolvedAt } : n,
    ),
  )
}

/** turn_request 알림 처리: granted 턴 저장 후 resolved */
export function resolveNotification(id: string, grantedTurns?: number): void {
  const all = readAll()
  writeAll(
    all.map((n) =>
      n.id === id
        ? {
            ...n,
            status: 'resolved' as NotificationStatus,
            resolvedAt: new Date().toISOString(),
            grantedTurns: grantedTurns ?? n.grantedTurns,
          }
        : n,
    ),
  )
}

/** 미처리(pending) 알림 수 */
export function getPendingCount(): number {
  return readAll().filter((n) => n.status === 'pending').length
}

/** 알림 삭제 */
export function deleteNotification(id: string): void {
  writeAll(readAll().filter((n) => n.id !== id))
}

// ── 글로벌 턴 설정 ────────────────────────────────────────────────────────────

export type GlobalTurnsConfig = {
  monthlyDefault: number
}

export function getGlobalTurnsConfig(): GlobalTurnsConfig {
  try {
    const raw = getPortalScopedItem(GLOBAL_TURNS_KEY)
    if (raw) return JSON.parse(raw) as GlobalTurnsConfig
  } catch { /* ignore */ }
  return { monthlyDefault: 5000 }
}

export function setGlobalTurnsConfig(config: GlobalTurnsConfig): void {
  setPortalScopedItem(GLOBAL_TURNS_KEY, JSON.stringify(config))
}

// ── 실시간 구독 (localStorage 이벤트) ────────────────────────────────────────

type Listener = () => void
const listeners = new Set<Listener>()

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key?.endsWith(NOTIFICATIONS_KEY)) {
      listeners.forEach((l) => l())
    }
  })
}

export function subscribeNotifications(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
