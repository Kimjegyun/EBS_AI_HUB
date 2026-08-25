import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import TencentLlmSettingsForm from '../components/TencentLlmSettingsForm'
import { useAuth } from '../auth/AuthContext'
import { useAppCatalog } from '../context/AppCatalogContext'
import { useEnvironmentConfig } from '../context/EnvironmentConfigContext'
import { APP_REGISTRY } from '../apps/registry'
import type { AppPlugin } from '../apps/types'
import { MY_LLM_APP_ID } from '../lib/tencentCatalog'
import type { EnvironmentPublicConfig } from '../types/environment'

const InventorySettingsPanel = lazy(() => import('../apps/inventory/InventorySettingsPanel'))
const INVENTORY_APP_ID = 'inventory'
import {
  getGlobalTurnsConfig,
  setGlobalTurnsConfig,
} from '../lib/notificationService'
import {
  listAiUsage,
  setUserAiLimit,
  setGroupAiLimit,
  deleteGroupAiLimit,
  readGroupLimits,
  DEFAULT_MONTHLY_TURNS,
  type AiUserUsage,
  type AiGroupLimit,
} from '../lib/aiUsageService'
import { listAiHubMembers, type AiHubMember } from '../auth/supabaseMembership'

// ── 롤업 섹션 래퍼 ────────────────────────────────────────────────────────────
function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string
  icon: string
  defaultOpen?: boolean
  badge?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-container-low/50 transition-colors select-none"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon name={icon} className="text-[16px]" />
        </div>
        <span className="flex-1 font-h3 text-h3 text-on-surface">{title}</span>
        {badge && (
          <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold">
            {badge}
          </span>
        )}
        <Icon
          name={open ? 'expand_less' : 'expand_more'}
          className="text-[18px] text-on-surface-variant transition-transform"
        />
      </button>
      {open && (
        <div className="border-t border-outline-variant px-4 py-3">
          {children}
        </div>
      )}
    </div>
  )
}

// ── 글로벌 턴 설정 ────────────────────────────────────────────────────────────
function GlobalTurnsSection() {
  const cfg = getGlobalTurnsConfig()
  const [draft, setDraft] = useState(String(cfg.monthlyDefault))
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    const v = Math.max(1, Math.floor(Number(draft) || DEFAULT_MONTHLY_TURNS))
    setGlobalTurnsConfig({ monthlyDefault: v })
    setDraft(String(v))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <CollapsibleSection title="글로벌 턴 기본값" icon="settings" defaultOpen>
      <p className="text-caption text-on-surface-variant mb-2">
        신규 사용자에게 적용되는 월별 기본 AI 턴 수입니다. 개별 사용자/그룹 설정이 이 값보다 우선됩니다.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8 w-32 rounded-md border border-outline-variant bg-surface px-2.5 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
        <button
          type="button"
          onClick={handleSave}
          className="h-8 rounded-md bg-primary px-4 text-label text-on-primary hover:bg-primary/90 flex items-center gap-1"
        >
          {saved ? <Icon name="check" className="text-[14px]" /> : <Icon name="save" className="text-[14px]" />}
          {saved ? '저장됨' : '저장'}
        </button>
        <span className="text-caption text-on-surface-variant/70">
          현재: <strong>{cfg.monthlyDefault.toLocaleString()}</strong>턴 / 월 · 매달 1일 초기화
        </span>
      </div>
    </CollapsibleSection>
  )
}

// ── 그룹별 턴 설정 ────────────────────────────────────────────────────────────
function GroupTurnsSection() {
  const [groups, setGroups] = useState<Record<string, AiGroupLimit>>(readGroupLimits)
  const [newName, setNewName] = useState('')
  const [newLimit, setNewLimit] = useState(String(DEFAULT_MONTHLY_TURNS))
  const [draftLimits, setDraftLimits] = useState<Record<string, string>>(
    () => Object.fromEntries(Object.values(readGroupLimits()).map((g) => [g.groupId, String(g.monthlyLimit)])),
  )
  const [savedId, setSavedId] = useState<string | null>(null)

  const refresh = () => {
    const fresh = readGroupLimits()
    setGroups(fresh)
    setDraftLimits(Object.fromEntries(Object.values(fresh).map((g) => [g.groupId, String(g.monthlyLimit)])))
  }

  const handleAdd = () => {
    const name = newName.trim()
    if (!name) return
    const id = `group-${Date.now()}`
    setGroupAiLimit(id, name, Math.max(1, Number(newLimit) || DEFAULT_MONTHLY_TURNS))
    setNewName('')
    setNewLimit(String(DEFAULT_MONTHLY_TURNS))
    refresh()
  }

  const handleSaveGroup = (g: AiGroupLimit) => {
    const limit = Math.max(1, Math.floor(Number(draftLimits[g.groupId]) || DEFAULT_MONTHLY_TURNS))
    setGroupAiLimit(g.groupId, g.groupName, limit)
    setSavedId(g.groupId)
    setTimeout(() => setSavedId(null), 1500)
    refresh()
  }

  return (
    <CollapsibleSection title="그룹별 턴 할당" icon="group_work" badge={`${Object.keys(groups).length}개`}>
      {/* 그룹 추가 */}
      <div className="flex flex-wrap items-center gap-2 mb-2 p-2 rounded-lg bg-surface-container-low border border-outline-variant">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="그룹 이름 (예: 개발팀)"
          className="h-7 w-32 rounded-md border border-outline-variant bg-surface px-2 text-body-sm"
        />
        <input
          type="number"
          min={1}
          value={newLimit}
          onChange={(e) => setNewLimit(e.target.value)}
          placeholder="월 턴"
          className="h-7 w-24 rounded-md border border-outline-variant bg-surface px-2 text-body-sm"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newName.trim()}
          className="h-7 rounded-md bg-primary text-on-primary px-3 text-caption flex items-center gap-1 hover:opacity-90 disabled:opacity-50"
        >
          <Icon name="add" className="text-[14px]" />
          추가
        </button>
      </div>

      {Object.keys(groups).length === 0 ? (
        <p className="text-caption text-on-surface-variant text-center py-3">
          등록된 그룹이 없습니다.
        </p>
      ) : (
        <div className="divide-y divide-outline-variant border border-outline-variant rounded-lg overflow-hidden">
          {Object.values(groups).map((g) => (
            <div key={g.groupId} className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-medium text-on-surface">{g.groupName}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-caption text-on-surface-variant">월 턴:</span>
                <input
                  type="number"
                  min={1}
                  value={draftLimits[g.groupId] ?? String(g.monthlyLimit)}
                  onChange={(e) => setDraftLimits((p) => ({ ...p, [g.groupId]: e.target.value }))}
                  className="w-20 h-7 rounded-md border border-outline-variant bg-surface px-2 text-body-sm"
                />
                <button
                  type="button"
                  onClick={() => handleSaveGroup(g)}
                  className={`h-7 rounded-md px-2.5 text-caption flex items-center gap-0.5 transition-colors ${
                    savedId === g.groupId ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary hover:bg-primary/20'
                  }`}
                >
                  {savedId === g.groupId ? <Icon name="check" className="text-[13px]" /> : null}
                  {savedId === g.groupId ? '완료' : '저장'}
                </button>
                <button
                  type="button"
                  onClick={() => { deleteGroupAiLimit(g.groupId); refresh() }}
                  className="h-7 w-7 rounded-md text-on-surface-variant hover:bg-error/10 hover:text-error flex items-center justify-center"
                  title="삭제"
                >
                  <Icon name="delete" className="text-[14px]" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  )
}

// ── 사용자별 턴 설정 ──────────────────────────────────────────────────────────
function UserTurnsSection() {
  const [members, setMembers] = useState<AiHubMember[]>([])
  const [usageByUser, setUsageByUser] = useState<Record<string, AiUserUsage>>({})
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ms = await listAiHubMembers()
      setMembers(ms)
      const usage = await listAiUsage(ms.map((m) => m.userId))
      setUsageByUser(usage)
      setLimitDrafts(
        Object.fromEntries(ms.map((m) => [m.userId, String(usage[m.userId]?.monthlyLimit ?? DEFAULT_MONTHLY_TURNS)])),
      )
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => undefined)
  }, [load])

  const handleSave = async (m: AiHubMember) => {
    const limit = Math.max(0, Math.floor(Number(limitDrafts[m.userId]) || 0))
    setSavingId(m.userId)
    await setUserAiLimit(m.userId, limit)
    setSavingId(null)
    setSavedId(m.userId)
    setTimeout(() => setSavedId(null), 1500)
  }

  const userMembers = members.filter((m) => m.role === 'user')

  return (
    <CollapsibleSection
      title="사용자별 턴 할당"
      icon="person"
      badge={`${userMembers.length}명`}
    >
      {loading ? (
        <div className="py-3 text-center text-on-surface-variant text-caption">불러오는 중…</div>
      ) : userMembers.length === 0 ? (
        <div className="py-3 text-center text-on-surface-variant text-caption">등록된 사용자가 없습니다.</div>
      ) : (
        <div className="divide-y divide-outline-variant border border-outline-variant rounded-lg overflow-hidden">
          {userMembers.map((m) => {
            const usage = usageByUser[m.userId]
            const used = usage?.usedThisMonth ?? 0
            const limit = usage?.monthlyLimit ?? DEFAULT_MONTHLY_TURNS
            const pct = Math.min((used / Math.max(limit, 1)) * 100, 100)
            return (
              <div key={m.userId} className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
                {/* 아바타 */}
                <div className="h-7 w-7 shrink-0 rounded-md bg-surface-dim flex items-center justify-center border border-outline-variant">
                  <span className="text-[10px] font-bold text-primary">{m.displayName.slice(0, 2).toUpperCase()}</span>
                </div>
                {/* 이름 + 사용률 */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-[13px] font-medium text-on-surface truncate min-w-[80px]">{m.displayName}</span>
                  <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden w-20 shrink-0">
                    <div
                      className={`h-full rounded-full ${pct >= 90 ? 'bg-error' : pct >= 70 ? 'bg-warning' : 'bg-primary'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-on-surface-variant whitespace-nowrap">{used.toLocaleString()} / {limit.toLocaleString()}</span>
                </div>
                {/* 한도 편집 */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    min={0}
                    value={limitDrafts[m.userId] ?? String(DEFAULT_MONTHLY_TURNS)}
                    onChange={(e) => setLimitDrafts((p) => ({ ...p, [m.userId]: e.target.value }))}
                    className="w-20 h-7 rounded-md border border-outline-variant bg-surface px-2 text-body-sm"
                    aria-label={`${m.displayName} 월 턴 한도`}
                  />
                  <button
                    type="button"
                    onClick={() => void handleSave(m)}
                    disabled={savingId === m.userId}
                    className={`h-7 rounded-md px-2.5 text-caption flex items-center gap-0.5 transition-colors disabled:opacity-60 ${
                      savedId === m.userId ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary hover:bg-primary/20'
                    }`}
                  >
                    {savingId === m.userId && <Icon name="progress_activity" className="animate-spin text-[12px]" />}
                    {savedId === m.userId ? <Icon name="check" className="text-[12px]" /> : null}
                    {savingId === m.userId ? '…' : savedId === m.userId ? '완료' : '저장'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </CollapsibleSection>
  )
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { isAdmin } = useAuth()
  const { config, refetch } = useEnvironmentConfig()
  const { isPublished } = useAppCatalog()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedAppId = searchParams.get('app') ?? ''
  const [selectedAppId, setSelectedAppId] = useState('')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (APP_REGISTRY.length === 0) { setSelectedAppId(''); return }
    if (APP_REGISTRY.some((app) => app.id === requestedAppId)) { setSelectedAppId(requestedAppId); return }
    setSelectedAppId((current) => {
      if (APP_REGISTRY.some((app) => app.id === current)) return current
      if (APP_REGISTRY.some((app) => app.id === MY_LLM_APP_ID)) return MY_LLM_APP_ID
      return APP_REGISTRY[0].id
    })
  }, [requestedAppId])

  const selectedApp = APP_REGISTRY.find((app) => app.id === selectedAppId)
  const selectApp = (appId: string) => { setSelectedAppId(appId); setSearchParams({ app: appId }, { replace: true }) }

  if (!isAdmin) {
    return (
      <main className="min-h-[calc(100vh-60px)] bg-background text-on-surface font-body text-body">
        <div className="mx-auto max-w-3xl p-6">
          <section className="rounded-xl border border-outline-variant bg-surface-container px-5 py-5">
            <div className="flex items-start gap-3">
              <Icon name="lock" className="mt-0.5 text-[22px] text-primary" />
              <div>
                <h1 className="font-h2 text-h2 text-on-surface">API 설정은 관리자 전용입니다</h1>
                <p className="mt-2 text-body-sm text-on-surface-variant">
                  USER 모드에서는 API 키를 입력하거나 변경할 수 없습니다.
                </p>
                <Link to="/dashboard" className="mt-4 inline-flex items-center gap-1.5 text-label text-primary hover:underline">
                  <Icon name="arrow_back" className="text-[16px]" />
                  대시보드로 돌아가기
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100vh-60px)] bg-background text-on-surface font-body text-body">
      <div className="mx-auto max-w-6xl p-4">
        <div className="mb-4">
          <h1 className="mb-0.5 font-h1 text-h1 text-on-surface">설정</h1>
          <p className="text-caption text-on-surface-variant">
            왼쪽에서 앱을 고르면 오른쪽에 해당 앱의 연동 설정이 표시됩니다.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* 앱 목록 사이드바 */}
          <aside className="space-y-1">
            <h2 className="px-1 font-label text-label text-on-surface-variant mb-1">앱</h2>
            {APP_REGISTRY.map((app) => {
              const selected = app.id === selectedAppId
              const configured = isAppConfigured(config, app.id)
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => selectApp(app.id)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    selected
                      ? 'border-primary bg-primary/5'
                      : 'border-outline-variant bg-surface-container hover:bg-surface-container-high'
                  }`}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-container-highest text-primary">
                    <Icon name={app.icon} className="text-[16px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-label text-label text-on-surface">{app.name}</div>
                    <div className="text-[10px] text-on-surface-variant">
                      {app.category}{isPublished(app.id) ? ' · 등록됨' : ''}
                    </div>
                  </div>
                  {hasAppSettings(app.id) ? (
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${configured ? 'bg-success/10 text-success' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                      {configured ? '설정됨' : '미설정'}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </aside>

          {/* 오른쪽: 앱 설정 (턴 관리는 나만의 LLM에 포함) */}
          <div className="min-w-0 space-y-2">
            {selectedApp && <SelectedAppSettings app={selectedApp} config={config} onSaved={refetch} />}
          </div>
        </div>
      </div>
    </main>
  )
}

function hasAppSettings(appId: string): boolean {
  return appId === MY_LLM_APP_ID || appId === INVENTORY_APP_ID
}

function isAppConfigured(config: EnvironmentPublicConfig, appId: string): boolean {
  if (appId === MY_LLM_APP_ID) {
    const app = config.ai_app_settings?.[appId]
    return Boolean(app?.ai_tencent_api_key_configured || config.ai_tencent_api_key_configured)
  }
  if (appId === INVENTORY_APP_ID) {
    try {
      const tabs = JSON.parse(localStorage.getItem('inventory-settings-tabs') ?? '[]') as unknown[]
      return tabs.length > 0
    } catch { return false }
  }
  return false
}

function SelectedAppSettings({
  app,
  config,
  onSaved,
}: {
  app: AppPlugin
  config: EnvironmentPublicConfig
  onSaved: () => Promise<void>
}) {
  return (
    <div className="space-y-1.5">
      <CollapsibleSection title={`${app.name} — 앱 정보`} icon={app.icon} defaultOpen>
        <p className="text-caption text-on-surface-variant">{app.description}</p>
      </CollapsibleSection>

      {app.id === MY_LLM_APP_ID ? (
        <>
          <CollapsibleSection title="Tencent API 설정" icon="vpn_key" defaultOpen>
            <TencentLlmSettingsForm config={config} onSaved={onSaved} />
          </CollapsibleSection>

          {/* ── AI 턴 관리 (나만의 LLM 전용 옵션) ── */}
          <div className="rounded-lg border border-outline-variant bg-surface-container-lowest overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-outline-variant bg-surface-container-low/50">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon name="token" className="text-[16px]" />
              </div>
              <span className="font-h3 text-h3 text-on-surface">AI 턴 관리</span>
              <span className="text-caption text-on-surface-variant ml-1">· 월별 사용량 제한 설정</span>
            </div>
            <div className="px-4 py-3 space-y-1.5">
              <GlobalTurnsSection />
              <GroupTurnsSection />
              <UserTurnsSection />
            </div>
          </div>
        </>
      ) : app.id === INVENTORY_APP_ID ? (
        <CollapsibleSection title="DB 파일 관리" icon="database" defaultOpen>
          <Suspense fallback={
            <div className="py-6 flex items-center justify-center gap-2 text-on-surface-variant text-body-sm">
              <Icon name="progress_activity" className="animate-spin text-[16px]" />불러오는 중...
            </div>
          }>
            <InventorySettingsPanel />
          </Suspense>
        </CollapsibleSection>
      ) : (
        <CollapsibleSection title="앱 설정" icon="tune">
          <div className="py-2 text-center">
            <Icon name="tune" className="text-[22px] text-on-surface-variant" />
            <h3 className="mt-2 font-h3 text-h3 text-on-surface">이 앱은 추가 설정이 없습니다</h3>
            <p className="mt-1 text-caption text-on-surface-variant">
              현재 API 키와 모델 주소는 나만의 LLM에서만 설정합니다.
            </p>
          </div>
        </CollapsibleSection>
      )}
    </div>
  )
}
