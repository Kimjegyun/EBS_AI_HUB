/**
 * 재물조사 독립 실행 앱 — /inventory 라우트 전용 (PWA)
 *
 * 인증 없이 동작합니다.
 * 최초 실행 시 이름/소속/부서를 입력하면 localStorage에 저장한 뒤
 * (소속은 운영관리부에서 배부된 본부 탭 중에서 선택합니다)
 * 바로 InventoryApp을 실행합니다.
 * 오프라인 상태에서도 이미 캐싱된 데이터로 완전히 동작합니다.
 */

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '../../components/Icon'
import InventoryApp from './InventoryApp'
import InventoryBuildStatus from './InventoryBuildStatus'
import InventoryInstallBanner from './InventoryInstallBanner'
import { getDistributedOrgs } from './datasetService'
import { applyInventoryApiOriginFromUrl } from './inventoryApiClient'

const PROFILE_KEY = 'inventory-user-profile'

interface UserProfile {
  name: string       // 이름
  org: string        // 소속(본부)
  dept: string       // 부서
}

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as UserProfile
    if (!p.name?.trim()) return null
    return p
  } catch {
    return null
  }
}

function saveProfile(p: UserProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
}

function clearProfile() {
  localStorage.removeItem(PROFILE_KEY)
}

/* ── 온보딩 화면 ─────────────────────────────────────────── */

function OnboardingScreen({ onDone }: { onDone: (p: UserProfile) => void }) {
  const [name, setName] = useState('')
  const [org, setOrg] = useState('')
  const [dept, setDept] = useState('')
  const [error, setError] = useState('')

  // 운영관리부에서 배부된 본부(탭) 목록 — 소속은 여기서 선택합니다.
  const [orgs, setOrgs] = useState<string[]>([])
  const [orgsFromCache, setOrgsFromCache] = useState(false)
  const [orgsLoading, setOrgsLoading] = useState(true)
  // 부서는 선택한 본부의 자산 마스터 설치부서 목록에서 고르고, 없으면 직접 입력합니다.
  const [departmentsByOrg, setDepartmentsByOrg] = useState<Record<string, string[]>>({})
  const [customDept, setCustomDept] = useState(false)
  const deptOptions = departmentsByOrg[org] ?? []

  const selectOrg = (next: string) => {
    setOrg(next)
    setError('')
    // 다른 본부의 부서가 남지 않도록, 새 본부 목록에 없는 부서는 비웁니다.
    if (!(departmentsByOrg[next] ?? []).includes(dept)) { setDept(''); setCustomDept(false) }
  }

  const loadOrgs = useCallback(async () => {
    try {
      const { orgs: list, fromCache, departmentsByOrg: byOrg } = await getDistributedOrgs()
      setOrgs(list)
      setDepartmentsByOrg(byOrg)
      setOrgsFromCache(fromCache && list.length > 0)
      setOrg((prev) => {
        if (list.length === 0) return ''
        if (prev && list.includes(prev)) return prev  // 이미 유효한 선택이면 유지
        return list.length === 1 ? list[0] : ''       // 배부 본부가 하나뿐이면 자동 선택
      })
    } catch {
      setOrgs([])
      setOrg('')
      setOrgsFromCache(false)
    } finally {
      setOrgsLoading(false)
    }
  }, [])

  // setState는 모두 await 이후에 일어나지만 규칙이 호출을 따라 들어가 오탐합니다.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadOrgs() }, [loadOrgs])

  const submit = () => {
    if (!name.trim()) { setError('이름을 입력해주세요.'); return }
    if (!dept.trim()) { setError(deptOptions.length && !customDept ? '부서를 선택해주세요.' : '조사 부서를 입력해주세요.'); return }
    if (orgsLoading || !orgs.includes(org)) {
      setError('등록된 엑셀의 본부 탭을 선택해주세요.')
      return
    }
    const profile: UserProfile = { name: name.trim(), org, dept: dept.trim() }
    saveProfile(profile)
    onDone(profile)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      {/* 앱 아이콘 + 타이틀 */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Icon name="inventory_2" className="text-primary text-[40px]" />
        </div>
        <h1 className="text-h1 font-bold text-on-surface">재물조사</h1>
        <p className="text-body-sm text-on-surface-variant mt-1">
          QR 스캔으로 자산을 실사하고 결과를 서버에 등록합니다
        </p>
      </div>

      {/* 입력 카드 */}
      <div className="w-full max-w-sm rounded-2xl border border-outline-variant bg-surface-container-low p-5 space-y-4 shadow-sm">
        <div>
          <p className="text-body-sm font-semibold text-on-surface mb-3">
            시작하기 전에 정보를 입력해주세요
          </p>

          <div className="space-y-3">
            <label className="block">
              <span className="text-caption text-on-surface-variant">
                이름 <span className="text-error">*</span>
              </span>
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="홍길동"
                className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-3 text-body outline-none focus:border-primary transition-colors"
                autoComplete="name"
                autoFocus
              />
            </label>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="inventory-org" className="text-caption text-on-surface-variant">
                  소속(본부) <span className="text-error">*</span>
                </label>
                {!orgsLoading && (
                  <button
                    type="button"
                    onClick={() => { setOrgsLoading(true); void loadOrgs() }}
                    className="flex items-center gap-1 text-[11px] text-on-surface-variant hover:text-primary transition-colors"
                  >
                    <Icon name="refresh" className="text-[13px]" />
                    목록 새로고침
                  </button>
                )}
              </div>

              {orgsLoading ? (
                <div className="mt-1 flex items-center gap-2 rounded-xl border border-outline-variant bg-surface px-3 py-3 text-caption text-on-surface-variant">
                  <Icon name="progress_activity" className="animate-spin text-[16px]" />
                  배부된 본부 목록을 불러오는 중…
                </div>
              ) : orgs.length > 0 ? (
                <>
                  <select
                    id="inventory-org"
                    name="organization"
                    value={org}
                    onChange={(e) => selectOrg(e.target.value)}
                    required
                    className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-3 text-base text-on-surface outline-none focus:border-primary transition-colors"
                  >
                    <option value="" disabled>소속 본부를 선택해주세요</option>
                    {orgs.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {orgsFromCache && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] text-on-surface-variant">
                      <Icon name="wifi_off" className="text-[13px]" />
                      오프라인 — 마지막으로 받은 배부 목록입니다
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1.5 text-[11px] text-on-surface-variant leading-relaxed">
                  선택할 엑셀 탭이 없습니다. 관리자가 Settings에서 전사 엑셀파일을 등록한 뒤 목록을 새로고침하세요.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="inventory-dept" className="text-caption text-on-surface-variant">
                부서 <span className="text-error">*</span>
              </label>
              {deptOptions.length > 0 && (
                <select
                  id="inventory-dept"
                  name="department"
                  value={customDept ? '__custom__' : dept}
                  onChange={(e) => {
                    const value = e.target.value
                    setError('')
                    if (value === '__custom__') { setCustomDept(true); setDept('') }
                    else { setCustomDept(false); setDept(value) }
                  }}
                  disabled={!org}
                  className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-3 text-base text-on-surface outline-none focus:border-primary transition-colors disabled:opacity-50"
                >
                  <option value="" disabled>부서를 선택해주세요</option>
                  {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                  <option value="__custom__">목록에 없음 · 직접 입력</option>
                </select>
              )}
              {(deptOptions.length === 0 || customDept) && (
                <input
                  id={deptOptions.length === 0 ? 'inventory-dept' : undefined}
                  value={dept}
                  onChange={(e) => { setDept(e.target.value); setError('') }}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder={org ? '예: 기술기획부' : '소속을 먼저 선택해주세요'}
                  autoFocus={customDept}
                  className="mt-1 w-full rounded-xl border border-outline-variant bg-surface px-3 py-3 text-body outline-none focus:border-primary transition-colors"
                />
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-error/10 border border-error/30 px-3 py-2 text-caption text-error">
            <Icon name="error" className="text-[16px] shrink-0" />
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={orgsLoading || !orgs.includes(org)}
          className="w-full rounded-xl bg-primary text-on-primary py-3 text-body font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="arrow_forward" className="text-[20px]" />
          재물조사 시작
        </button>
      </div>

      <div className="mt-3 w-full max-w-sm"><InventoryInstallBanner /></div>
    </div>
  )
}

/* ── 프로필 표시 헤더 (재물조사 실행 중 상단) ──────────── */

function ProfileBar({
  profile,
  onEdit,
}: {
  profile: UserProfile
  onEdit: () => void
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-surface-container border-b border-outline-variant/50">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
          <Icon name="person" className="text-primary text-[16px]" />
        </div>
        <div className="min-w-0">
          <p className="text-body-sm font-semibold text-on-surface truncate leading-tight">
            {profile.name}
          </p>
          <p className="text-[10px] text-on-surface-variant truncate leading-tight">
            {profile.org}{profile.dept ? ` · ${profile.dept}` : ''}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 text-[11px] text-on-surface-variant border border-outline-variant rounded-lg px-2 py-1 hover:bg-surface-container-high"
      >
        변경
      </button>
    </div>
  )
}

/* ── 오프라인 상태 배너 ────────────────────────────────── */

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (!offline) return null
  return (
    <div className="flex items-center justify-center gap-2 bg-warning/15 border-b border-warning/30 px-3 py-1.5 text-[11px] text-warning font-medium">
      <Icon name="wifi_off" className="text-[14px]" />
      오프라인 — 조사 결과는 로컬에 저장되며, 연결 복구 시 자동 동기화됩니다
    </div>
  )
}

/* ── 메인 컴포넌트 ──────────────────────────────────────── */

export default function InventoryStandaloneApp() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  // ready는 localStorage 읽기 완료 여부 — 동기 작업이라 즉시 완료됨
  const [ready, setReady] = useState(false)

  useEffect(() => {
    applyInventoryApiOriginFromUrl()
    let active = true
    const saved = loadProfile()
    void getDistributedOrgs().then(({ orgs }) => {
      if (active) setProfile(saved && orgs.includes(saved.org) ? saved : null)
    }).finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Icon name="progress_activity" className="animate-spin text-primary text-[32px]" />
      </div>
    )
  }

  if (!profile) {
    return <><OnboardingScreen onDone={setProfile} /><InventoryBuildStatus /></>
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <OfflineBanner />
      <div className="px-3 pt-2"><InventoryInstallBanner /></div>
      <ProfileBar
        profile={profile}
        onEdit={() => {
          clearProfile()
          setProfile(null)
        }}
      />
      <div className="flex-1 overflow-auto p-3">
        <InventoryApp
          overrideUserName={profile.name}
          overrideUserDept={`${profile.org}${profile.dept ? ' ' + profile.dept : ''}`}
          overrideParentDept={profile.org}
          overrideSurveyDept={profile.dept || profile.org}
          overrideIsAdmin={false}
        />
      </div>
      <InventoryBuildStatus />
    </div>
  )
}
