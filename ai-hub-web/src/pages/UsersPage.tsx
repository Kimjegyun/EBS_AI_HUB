import { useCallback, useEffect, useMemo, useState } from 'react'
import { deleteAiHubMember, setAiHubMemberRole, listAiHubMembers, updateAiHubMember, type AiHubMember } from '../auth/supabaseMembership'
import { useAuth } from '../auth/AuthContext'
import { Icon } from '../components/Icon'
import MemberEditDialog from '../components/MemberEditDialog'
import MemberPasswordResetDialog from '../components/MemberPasswordResetDialog'
import {
  listAiUsage,
  setUserAiLimit,
  listAiGroups,
  saveAiGroup,
  deleteAiGroup,
  setUserAiGroup,
  DEFAULT_MONTHLY_TURNS,
  type AiUserUsage,
  type AiGroupLimit,
} from '../lib/aiUsageService'

function statusClass(status: AiHubMember['status']) {
  if (status === 'approved') return 'bg-success/10 text-success'
  if (status === 'rejected') return 'bg-error/10 text-error'
  return 'bg-warning text-white'
}

function statusIcon(status: AiHubMember['status']) {
  if (status === 'approved') return 'check_circle'
  if (status === 'rejected') return 'cancel'
  return 'schedule'
}

/** Display names like "kjg" or "J.Kim" (no Hangul, short) need a 성명 to be recognisable. */
function looksLikeShortEnglishName(name: string) {
  const value = name.trim()
  return !/[가-힣]/.test(value) && /^[A-Za-z0-9 ._-]{1,12}$/.test(value)
}

function formatDate(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString()
}

// ─── 그룹 관리 패널 ────────────────────────────────────────────────────────────
function GroupPanel({
  groups,
  onSave,
  onDelete,
}: {
  groups: Record<string, AiGroupLimit>
  onSave: (id: string, name: string, limit: number) => void
  onDelete: (id: string) => void
}) {
  const [newName, setNewName] = useState('')
  const [newLimit, setNewLimit] = useState(String(DEFAULT_MONTHLY_TURNS))
  const [draftLimits, setDraftLimits] = useState<Record<string, string>>(
    () => Object.fromEntries(Object.values(groups).map((g) => [g.groupId, String(g.monthlyLimit)])),
  )

  const handleAdd = () => {
    const name = newName.trim()
    if (!name) return
    const id = `group-${Date.now()}`
    const limit = Math.max(0, Math.floor(Number(newLimit) || DEFAULT_MONTHLY_TURNS))
    onSave(id, name, limit)
    setNewName('')
    setNewLimit(String(DEFAULT_MONTHLY_TURNS))
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm mt-3">
      <div className="px-3 py-2 border-b border-outline-variant flex flex-wrap items-center gap-2 bg-surface-container-low/50">
        <Icon name="group_work" className="text-primary text-[20px]" />
        <h2 className="font-h3 text-h3 text-on-surface">그룹별 턴 할당</h2>
        <span className="ml-auto text-caption text-on-surface-variant">
          그룹에 월 턴을 정하고, Member List의 Group 칸에서 사용자를 지정하세요. 그룹에 지정된 사용자는 그룹 한도가 적용됩니다.
        </span>
      </div>

      {/* 그룹 추가 폼 */}
      <div className="px-3 py-2 bg-surface-container-low/30 border-b border-outline-variant flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-caption text-on-surface-variant">그룹 이름</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="예: 개발팀"
            className="h-9 rounded-lg border border-outline-variant bg-surface px-3 text-body-sm w-36"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-caption text-on-surface-variant">월 기본 턴</label>
          <input
            type="number"
            min={0}
            value={newLimit}
            onChange={(e) => setNewLimit(e.target.value)}
            className="h-9 rounded-lg border border-outline-variant bg-surface px-3 text-body-sm w-28"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newName.trim()}
          className="h-9 rounded-lg bg-primary text-on-primary px-4 font-label text-label flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 transition-all"
        >
          <Icon name="add" className="text-[18px]" />
          그룹 추가
        </button>
      </div>

      {/* 그룹 목록 */}
      {Object.keys(groups).length === 0 ? (
        <div className="px-3 py-3 text-center text-on-surface-variant text-body-sm">
          등록된 그룹이 없습니다. 그룹을 추가해 팀별로 턴을 관리하세요.
        </div>
      ) : (
        <div className="divide-y divide-outline-variant">
          {Object.values(groups).map((group) => (
            <div key={group.groupId} className="px-3 py-2 flex items-center gap-4">
              <div className="flex-1">
                <p className="font-h3 text-[14px] text-on-surface">{group.groupName}</p>
                {group.groupId === 'ADMIN' && <p className="text-caption text-primary">소속 사용자에게 ADMIN 권한을 부여합니다.</p>}
                <p className="text-caption text-on-surface-variant">소속 {group.memberCount ?? 0}명</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-caption text-on-surface-variant">월 턴:</span>
                <input
                  type="number"
                  min={0}
                  value={draftLimits[group.groupId] ?? String(group.monthlyLimit)}
                  onChange={(e) =>
                    setDraftLimits((prev) => ({ ...prev, [group.groupId]: e.target.value }))
                  }
                  className="w-24 h-8 rounded-md border border-outline-variant bg-surface px-2 text-body-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    const limit = Math.max(0, Math.floor(Number(draftLimits[group.groupId]) || 0))
                    onSave(group.groupId, group.groupName, limit)
                  }}
                  className="h-8 rounded-md bg-primary/10 px-3 text-label text-primary hover:bg-primary/20"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(group.groupId)}
                  disabled={group.groupId === 'ADMIN'}
                  className="h-8 w-8 rounded-md text-on-surface-variant hover:bg-error/10 hover:text-error flex items-center justify-center"
                  title="그룹 삭제"
                >
                  <Icon name="delete" className="text-[17px]" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function UsersPage() {
  const [members, setMembers] = useState<AiHubMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)
  const [usageByUser, setUsageByUser] = useState<Record<string, AiUserUsage>>({})
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({})
  const [groups, setGroups] = useState<Record<string, AiGroupLimit>>({})
  const [editing, setEditing] = useState<AiHubMember | null>(null)
  const [resettingPassword, setResettingPassword] = useState<AiHubMember | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { session } = useAuth()
  const myUserId = session?.userId
  const iAmOwner = members.some((m) => m.userId === myUserId && m.role === 'owner' && m.status === 'approved')
  const organizationOptions = useMemo(() => [...new Set(members.map((m) => m.organization?.trim()).filter((org): org is string => !!org))].sort(), [members])

  const loadMembers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const nextMembers = await listAiHubMembers()
      setMembers(nextMembers)
      const usage = await listAiUsage(nextMembers.map((member) => member.userId))
      setUsageByUser(usage)
      // Groups load separately so a missing group migration does not hide the member list.
      listAiGroups().then(setGroups).catch((err: unknown) => setError(err instanceof Error ? err.message : '그룹 목록을 불러오지 못했습니다.'))
      setLimitDrafts(
        Object.fromEntries(
          nextMembers.map((member) => [
            member.userId,
            String(usage[member.userId]?.ownLimit ?? usage[member.userId]?.monthlyLimit ?? DEFAULT_MONTHLY_TURNS),
          ]),
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '사용자 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { void loadMembers() }, 0)
    return () => clearTimeout(timer)
  }, [loadMembers])

  const stats = useMemo(() => {
    return {
      total: members.length,
      active: members.filter((m) => m.status === 'approved').length,
      pending: members.filter((m) => m.status === 'pending').length,
      admin: members.filter((m) => m.role === 'owner' || m.role === 'admin').length,
    }
  }, [members])

  const sortedMembers = useMemo(() => [...members].sort((a, b) => {
    const rank = { owner: 0, admin: 1, user: 2 }
    return rank[a.role] - rank[b.role]
  }), [members])

  async function updateMember(member: AiHubMember, status: 'approved' | 'rejected') {
    setUpdatingUserId(member.userId)
    setError(null)
    try {
      await updateAiHubMember({
        userId: member.userId,
        status,
        role: member.role,
      })
      await loadMembers()
    } catch (err) {
      setError(err instanceof Error ? err.message : '사용자 상태를 변경하지 못했습니다.')
    } finally {
      setUpdatingUserId(null)
    }
  }

  async function changeRole(member: AiHubMember, role: 'admin' | 'user') {
    setUpdatingUserId(member.userId)
    setError(null)
    try {
      await setAiHubMemberRole(member.userId, role)
      await loadMembers()
    } catch (err) {
      setError(err instanceof Error ? err.message : '역할 변경에 실패했습니다.')
    } finally {
      setUpdatingUserId(null)
    }
  }

  async function removeMember(member: AiHubMember) {
    const typed = window.prompt(
      `사용자를 삭제합니다. 되돌릴 수 없습니다.\n\n${member.displayName} (${member.email})\n\n` +
      'AI 허브 회원 정보가 삭제되고, 다른 서비스에서 쓰지 않는 계정이면 로그인 계정도 삭제됩니다.\n' +
      '재물조사 결과처럼 이미 등록된 업무 기록은 그대로 남습니다.\n\n' +
      '계속하려면 이 사용자의 이메일을 입력하세요.',
    )
    if (typed === null) return
    if (typed.trim().toLowerCase() !== member.email.toLowerCase()) {
      setError('입력한 이메일이 일치하지 않아 삭제하지 않았습니다.')
      return
    }
    setUpdatingUserId(member.userId)
    setError(null)
    setNotice(null)
    try {
      const { accountDeleted } = await deleteAiHubMember(member.userId)
      setNotice(accountDeleted
        ? `${member.email} 사용자를 삭제했습니다. 같은 이메일로 다시 가입할 수 있습니다.`
        : `${member.email} 사용자를 AI 허브에서 삭제했습니다. 다른 서비스에서 쓰는 로그인 계정은 유지됩니다.`)
      await loadMembers()
    } catch (err) {
      setError(err instanceof Error ? err.message : '사용자를 삭제하지 못했습니다.')
    } finally {
      setUpdatingUserId(null)
    }
  }

  async function saveUserLimit(member: AiHubMember) {
    const raw = limitDrafts[member.userId] ?? String(DEFAULT_MONTHLY_TURNS)
    const nextLimit = Math.max(0, Math.floor(Number(raw) || 0))
    setUpdatingUserId(member.userId)
    setError(null)
    try {
      await setUserAiLimit(member.userId, nextLimit)
      await loadMembers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 턴 한도를 저장하지 못했습니다.')
    } finally {
      setUpdatingUserId(null)
    }
  }

  async function handleGroupSave(id: string, name: string, limit: number) {
    setError(null)
    try {
      await saveAiGroup(id, name, limit)
      await loadMembers()
    } catch (err) {
      setError(err instanceof Error ? err.message : '그룹을 저장하지 못했습니다.')
    }
  }

  async function handleGroupDelete(id: string) {
    const group = groups[id]
    if (group?.memberCount && !window.confirm(`'${group.groupName}' 그룹을 삭제할까요?
소속 사용자 ${group.memberCount}명은 개별 한도로 돌아갑니다.`)) return
    setError(null)
    try {
      await deleteAiGroup(id)
      await loadMembers()
    } catch (err) {
      setError(err instanceof Error ? err.message : '그룹을 삭제하지 못했습니다.')
    }
  }

  async function assignGroup(member: AiHubMember, groupId: string) {
    setUpdatingUserId(member.userId)
    setError(null)
    try {
      await setUserAiGroup(member.userId, groupId || null)
      await loadMembers()
    } catch (err) {
      setError(err instanceof Error ? err.message : '그룹을 지정하지 못했습니다.')
    } finally {
      setUpdatingUserId(null)
    }
  }

  return (
    <main className="min-h-[calc(100vh-48px)] p-3 overflow-y-auto custom-scrollbar flex-1 bg-surface-bright">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-3">
        <div>
          <h1 className="font-h1 text-h1 text-on-surface tracking-tight">사용자 관리</h1>
          <p className="text-body-sm text-on-surface-variant mt-1">
            EBS AI 허브 프로젝트에 가입 요청한 사용자를 승인하거나 거절합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadMembers()}
          className="bg-primary text-on-primary font-h3 text-h3 px-3 py-2 rounded-lg flex items-center gap-2 hover:opacity-90 transition-all shadow-md disabled:opacity-60"
          disabled={loading}
        >
          <Icon name="refresh" />
          새로고침
        </button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        {[
          { label: 'Total Users', value: stats.total, icon: 'group', tone: 'text-primary bg-primary/10' },
          { label: 'Active', value: stats.active, icon: 'check_circle', tone: 'text-success bg-success/10' },
          { label: 'Pending', value: stats.pending, icon: 'pending', tone: 'text-warning bg-warning/10' },
          { label: 'Admin', value: stats.admin, icon: 'admin_panel_settings', tone: 'text-tertiary bg-tertiary/10' },
        ].map((item) => (
          <div key={item.label} className="bg-surface-container-lowest border border-outline-variant rounded-xl px-3 py-2 shadow-sm flex items-center gap-3">
            <div className="flex shrink-0 items-center">
              <div className={`p-2 rounded-lg ${item.tone}`}>
                <Icon name={item.icon} />
              </div>
            </div>
            <p className="text-on-surface-variant font-label text-label uppercase tracking-wide flex-1">{item.label}</p>
            <p className="text-xl font-bold text-on-surface">{item.value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error/20 bg-error-container/30 px-4 py-3 text-error font-body-sm">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="mb-4 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-body-sm text-on-surface">
          {notice}
        </div>
      )}

      {/* 사용자 목록 */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div className="px-3 py-2 border-b border-outline-variant flex flex-wrap gap-2 justify-between items-center bg-surface-container-low/50">
          <h2 className="font-h3 text-h3 text-on-surface flex items-center gap-2">
            Member List
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[10px] font-bold">
              LATEST {members.length}
            </span>
          </h2>
          <span className="text-caption text-on-surface-variant">
            기본 월 턴: <strong>{DEFAULT_MONTHLY_TURNS.toLocaleString()}</strong>회 · 매달 1일 자동 초기화
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] table-fixed text-left border-collapse">
            {/* Column widths sized to content so badges, dates and buttons never wrap. */}
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[14%]" />
              <col className="w-[8%]" />
              <col className="w-[15%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[15%]" />
              <col className="w-[9%]" />
            </colgroup>
            <thead>
              <tr className="bg-surface-container-low">
                <th className="px-3 py-2 font-label text-label text-on-surface-variant uppercase tracking-wider whitespace-nowrap">User</th>
                <th className="px-3 py-2 font-label text-label text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Organization</th>
                <th className="px-3 py-2 font-label text-label text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Role</th>
                <th className="px-3 py-2 font-label text-label text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Group</th>
                <th className="px-3 py-2 font-label text-label text-on-surface-variant uppercase tracking-wider whitespace-nowrap">Status</th>
                <th className="px-3 py-2 font-label text-label text-on-surface-variant uppercase tracking-wider whitespace-nowrap">가입·승인</th>
                <th className="px-3 py-2 font-label text-label text-on-surface-variant uppercase tracking-wider whitespace-nowrap">월 턴 할당</th>
                <th className="px-3 py-2 font-label text-label text-on-surface-variant uppercase tracking-wider whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                <tr>
                  <td className="px-3 py-3 text-center text-on-surface-variant" colSpan={8}>
                    사용자 목록을 불러오는 중입니다.
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-center text-on-surface-variant" colSpan={8}>
                    등록된 EBS AI 허브 멤버가 없습니다.
                  </td>
                </tr>
              ) : (
                sortedMembers.map((member) => {
                  const isAdministrator = member.role === 'owner' || member.role === 'admin'
                  const usage = usageByUser[member.userId]
                  const used = usage?.usedThisMonth ?? 0
                  const group = usage?.groupId ? groups[usage.groupId] : undefined
                  // A group's limit replaces the member's own limit while they belong to it.
                  const limit = group?.monthlyLimit ?? usage?.monthlyLimit ?? DEFAULT_MONTHLY_TURNS
                  const pct = Math.min((used / Math.max(limit, 1)) * 100, 100)

                  return (
                    <tr
                      key={member.userId}
                      className={isAdministrator ? 'bg-primary/10 hover:bg-primary/15 transition-colors border-l-4 border-l-primary' : member.status === 'pending' ? 'bg-warning/5 hover:bg-warning/10 transition-colors' : 'hover:bg-surface-container-low transition-colors'}
                    >
                      <td className="px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="w-8 h-8 shrink-0 rounded-lg bg-surface-dim flex items-center justify-center border border-outline-variant">
                            <span className="font-h3 text-h3 text-primary">
                              {member.displayName.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-h3 text-[14px] text-on-surface" title={member.displayName}>{member.displayName}</p>
                            <p className="truncate text-caption text-on-surface-variant" title={member.email}>{member.email}</p>
                            {member.emailConfirmed === false && (
                              <span title="가입자가 인증 메일의 링크를 누르기 전에는 승인해도 로그인할 수 없습니다." className="mt-0.5 inline-flex items-center gap-0.5 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                                <Icon name="mark_email_unread" className="text-[12px]" /> 이메일 미인증
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-body text-body text-on-surface-variant [word-break:keep-all]">
                        {member.realName ? (
                          <div className="font-semibold text-on-surface">{member.realName}</div>
                        ) : looksLikeShortEnglishName(member.displayName) && (
                          <button
                            type="button"
                            onClick={() => { setNotice(null); setEditing(member) }}
                            title="표시 이름이 영문 약자입니다. 수정에서 성명을 입력하세요."
                            className="mb-0.5 inline-flex items-center gap-0.5 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning"
                          >
                            <Icon name="badge" className="text-[12px]" /> 성명 미입력
                          </button>
                        )}
                        <div>{member.organization ?? '-'}</div>
                        {member.department && <div className="text-caption">{member.department}</div>}
                        {member.contactPhone && <div className="text-caption">{member.contactPhone}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={member.role}
                          onChange={(event) => void changeRole(member, event.target.value as 'admin' | 'user')}
                          disabled={member.role === 'owner' || member.userId === myUserId || updatingUserId === member.userId || usage?.groupId === 'ADMIN'}
                          aria-label={member.displayName + ' 역할'}
                          title={usage?.groupId === 'ADMIN' ? 'ADMIN 그룹에서 제외한 뒤 역할을 변경하세요.' : '역할 변경'}
                          className="w-full rounded-md border border-outline-variant bg-surface px-1 py-1 text-body-sm disabled:opacity-60"
                        >
                          {member.role === 'owner' && <option value="owner">OWNER</option>}
                          <option value="user">USER</option>
                          <option value="admin">ADMIN</option>
                        </select>
                        <span hidden title={member.role === 'owner' ? '관리자 (소유자)' : isAdministrator ? '관리자' : '사용자'} className={`whitespace-nowrap font-label text-label px-2 py-1 rounded-md ${isAdministrator ? 'bg-primary text-white font-bold' : 'bg-surface border border-outline-variant text-on-surface'}`}>
                          {member.role === 'owner' ? 'OWNER' : isAdministrator ? 'ADMIN' : 'USER'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {member.role !== 'owner' ? (
                          <div className="space-y-0.5">
                            <select
                              value={usage?.groupId ?? ''}
                              onChange={(event) => void assignGroup(member, event.target.value)}
                              disabled={updatingUserId === member.userId || member.userId === myUserId}
                              className="w-full rounded-md border border-outline-variant bg-surface px-2 py-1 text-body-sm disabled:opacity-60"
                              aria-label={`${member.displayName} 그룹`}
                            >
                              <option value="">개별 한도</option>
                              {Object.values(groups).map((group) => (
                                <option key={group.groupId} value={group.groupId}>{group.groupName}</option>
                              ))}
                            </select>
                            {usage?.groupId && groups[usage.groupId] && (
                              <p className="text-caption text-on-surface-variant">월 {groups[usage.groupId].monthlyLimit.toLocaleString()}턴 · 그룹 한도</p>
                            )}
                            {!Object.keys(groups).length && <p className="text-caption text-on-surface-variant">아래 '그룹별 턴 할당'에서 그룹을 만드세요</p>}
                          </div>
                        ) : (
                          <span className="text-caption text-on-surface-variant">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`${statusClass(member.status)} font-label text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit whitespace-nowrap`}>
                          <Icon name={statusIcon(member.status)} className="text-[12px]" />
                          {member.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-body text-body-sm text-on-surface-variant whitespace-nowrap">
                        <div title="가입일">{formatDate(member.createdAt)}</div>
                        {member.approvedAt && <div className="text-caption" title="승인일">승인 {formatDate(member.approvedAt)}</div>}
                      </td>
                      <td className="px-3 py-2">
                        {member.role === 'user' ? (
                          <div className="space-y-1">
                            {/* 사용량 바 */}
                            <div className="flex items-center gap-2 text-caption text-on-surface-variant">
                              <span className="whitespace-nowrap">{used.toLocaleString()} / {limit.toLocaleString()} 턴</span>
                              <span className={`ml-auto font-semibold ${pct >= 90 ? 'text-error' : pct >= 70 ? 'text-warning' : 'text-primary'}`}>
                                {Math.round(pct)}%
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pct >= 90 ? 'bg-error' : pct >= 70 ? 'bg-warning' : 'bg-primary'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            {/* 한도 편집 */}
                            {usage?.groupId ? (
                              <p
                                className="text-caption text-on-surface-variant"
                                title={`그룹에서 빠지면 개별 한도 ${(usage.ownLimit ?? DEFAULT_MONTHLY_TURNS).toLocaleString()}턴이 다시 적용됩니다.`}
                              >
                                {group ? `'${group.groupName}' 그룹 한도 적용` : '그룹 한도 적용'}
                              </p>
                            ) : (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                value={limitDrafts[member.userId] ?? String(DEFAULT_MONTHLY_TURNS)}
                                onChange={(event) =>
                                  setLimitDrafts((current) => ({
                                    ...current,
                                    [member.userId]: event.target.value,
                                  }))
                                }
                                className="w-full min-w-0 max-w-[96px] rounded-md border border-outline-variant bg-surface px-2 py-1 text-body-sm"
                                aria-label={`${member.displayName} 월 턴 한도`}
                              />
                              <button
                                type="button"
                                onClick={() => void saveUserLimit(member)}
                                disabled={updatingUserId === member.userId}
                                className="shrink-0 whitespace-nowrap rounded-md bg-primary/10 px-2 py-1 text-label text-primary hover:bg-primary/20 disabled:opacity-60"
                              >
                                저장
                              </button>
                            </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-caption text-on-surface-variant">Admin</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => { setNotice(null); setEditing(member) }}
                            disabled={updatingUserId === member.userId}
                            title="정보 수정"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container-high disabled:opacity-60"
                            aria-label={`${member.displayName} 정보 수정`}
                          >
                            <Icon name="edit" className="text-[17px]" />
                          </button>
                          {member.userId !== myUserId && !(member.role === 'owner' && !iAmOwner) && (
                            <button
                              type="button"
                              onClick={() => { setNotice(null); setResettingPassword(member) }}
                              disabled={updatingUserId === member.userId}
                              title="비밀번호 초기화"
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container-high disabled:opacity-60"
                              aria-label={`${member.displayName} 비밀번호 초기화`}
                            >
                              <Icon name="lock_reset" className="text-[17px]" />
                            </button>
                          )}
                          {member.userId !== myUserId && !(member.role === 'owner' && !iAmOwner) && (
                            <button
                              type="button"
                              onClick={() => void removeMember(member)}
                              disabled={updatingUserId === member.userId}
                              title="삭제"
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-error/30 text-error hover:bg-error/10 disabled:opacity-60"
                              aria-label={`${member.displayName} 삭제`}
                            >
                              <Icon name="delete" className="text-[17px]" />
                            </button>
                          )}
                        </div>
                        {member.status === 'pending' && (
                          <div className="mt-1.5 flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              className="whitespace-nowrap rounded-lg bg-success px-2.5 py-1 font-label text-label text-white shadow-sm hover:opacity-90 disabled:opacity-60"
                              disabled={updatingUserId === member.userId}
                              onClick={() => void updateMember(member, 'approved')}
                            >
                              승인
                            </button>
                            <button
                              type="button"
                              className="whitespace-nowrap rounded-lg border border-error/20 bg-error/10 px-2.5 py-1 font-label text-label text-error hover:bg-error/20 disabled:opacity-60"
                              disabled={updatingUserId === member.userId}
                              onClick={() => void updateMember(member, 'rejected')}
                            >
                              거절
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <GroupPanel groups={groups} onSave={handleGroupSave} onDelete={handleGroupDelete} />
      {resettingPassword && (
        <MemberPasswordResetDialog
          member={resettingPassword}
          onClose={() => setResettingPassword(null)}
          onDone={(message) => { setNotice(message); setResettingPassword(null) }}
        />
      )}
      {editing && (
        <MemberEditDialog
          member={editing}
          isSelf={editing.userId === myUserId}
          canManageOwner={iAmOwner}
          organizationOptions={organizationOptions}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setNotice(`${editing.email} 사용자 정보를 저장했습니다.`)
            setEditing(null)
            void loadMembers()
          }}
        />
      )}
    </main>
  )
}
