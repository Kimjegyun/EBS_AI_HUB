import { useCallback, useEffect, useMemo, useState } from 'react'
import { listAiHubMembers, updateAiHubMember, type AiHubMember } from '../auth/supabaseMembership'
import { Icon } from '../components/Icon'
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
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm mb-8">
      <div className="px-6 py-4 border-b border-outline-variant flex items-center gap-2 bg-surface-container-low/50">
        <Icon name="group_work" className="text-primary text-[20px]" />
        <h2 className="font-h3 text-h3 text-on-surface">그룹별 턴 할당</h2>
        <span className="ml-auto text-caption text-on-surface-variant">
          그룹에 월별 기본 턴을 설정합니다. 개별 사용자 한도가 우선 적용됩니다.
        </span>
      </div>

      {/* 그룹 추가 폼 */}
      <div className="px-6 py-4 bg-surface-container-low/30 border-b border-outline-variant flex flex-wrap items-end gap-3">
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
        <div className="px-6 py-8 text-center text-on-surface-variant text-body-sm">
          등록된 그룹이 없습니다. 그룹을 추가해 팀별로 턴을 관리하세요.
        </div>
      ) : (
        <div className="divide-y divide-outline-variant">
          {Object.values(groups).map((group) => (
            <div key={group.groupId} className="px-6 py-3 flex items-center gap-4">
              <div className="flex-1">
                <p className="font-h3 text-[14px] text-on-surface">{group.groupName}</p>
                <p className="text-caption text-on-surface-variant">ID: {group.groupId}</p>
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
  const [groups, setGroups] = useState<Record<string, AiGroupLimit>>(readGroupLimits)

  const loadMembers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const nextMembers = await listAiHubMembers()
      setMembers(nextMembers)
      const usage = await listAiUsage(nextMembers.map((member) => member.userId))
      setUsageByUser(usage)
      setLimitDrafts(
        Object.fromEntries(
          nextMembers.map((member) => [
            member.userId,
            String(usage[member.userId]?.monthlyLimit ?? DEFAULT_MONTHLY_TURNS),
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
    loadMembers().catch(() => undefined)
  }, [loadMembers])

  const stats = useMemo(() => {
    return {
      total: members.length,
      active: members.filter((m) => m.status === 'approved').length,
      pending: members.filter((m) => m.status === 'pending').length,
      admin: members.filter((m) => m.role === 'owner' || m.role === 'admin').length,
    }
  }, [members])

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

  function handleGroupSave(id: string, name: string, limit: number) {
    setGroupAiLimit(id, name, limit)
    setGroups(readGroupLimits())
  }

  function handleGroupDelete(id: string) {
    deleteGroupAiLimit(id)
    setGroups(readGroupLimits())
  }

  return (
    <main className="min-h-[calc(100vh-60px)] p-6 overflow-y-auto custom-scrollbar flex-1 bg-surface-bright">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="font-h1 text-h1 text-on-surface tracking-tight">사용자 관리</h1>
          <p className="text-body-sm text-on-surface-variant mt-1">
            EBS AI 허브 프로젝트에 가입 요청한 사용자를 승인하거나 거절합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadMembers()}
          className="bg-primary text-on-primary font-h3 text-h3 px-5 py-3 rounded-lg flex items-center gap-2 hover:opacity-90 transition-all shadow-md disabled:opacity-60"
          disabled={loading}
        >
          <Icon name="refresh" />
          새로고침
        </button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Users', value: stats.total, icon: 'group', tone: 'text-primary bg-primary/10' },
          { label: 'Active', value: stats.active, icon: 'check_circle', tone: 'text-success bg-success/10' },
          { label: 'Pending', value: stats.pending, icon: 'pending', tone: 'text-warning bg-warning/10' },
          { label: 'Admin', value: stats.admin, icon: 'admin_panel_settings', tone: 'text-tertiary bg-tertiary/10' },
        ].map((item) => (
          <div key={item.label} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-2 rounded-lg ${item.tone}`}>
                <Icon name={item.icon} />
              </div>
            </div>
            <p className="text-on-surface-variant font-label text-label uppercase tracking-widest mb-1">{item.label}</p>
            <p className="text-display font-display text-on-surface">{item.value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error/20 bg-error-container/30 px-4 py-3 text-error font-body-sm">
          {error}
        </div>
      )}

      {/* 그룹별 턴 관리 */}
      <GroupPanel groups={groups} onSave={handleGroupSave} onDelete={handleGroupDelete} />

      {/* 사용자 목록 */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-low/50">
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
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low">
                <th className="px-6 py-3 font-label text-label text-on-surface-variant uppercase tracking-wider">User</th>
                <th className="px-6 py-3 font-label text-label text-on-surface-variant uppercase tracking-wider">Organization</th>
                <th className="px-6 py-3 font-label text-label text-on-surface-variant uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 font-label text-label text-on-surface-variant uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 font-label text-label text-on-surface-variant uppercase tracking-wider">Join Date</th>
                <th className="px-6 py-3 font-label text-label text-on-surface-variant uppercase tracking-wider">월 턴 할당</th>
                <th className="px-6 py-3 font-label text-label text-on-surface-variant uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                <tr>
                  <td className="px-6 py-8 text-center text-on-surface-variant" colSpan={7}>
                    사용자 목록을 불러오는 중입니다.
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td className="px-6 py-8 text-center text-on-surface-variant" colSpan={7}>
                    등록된 EBS AI 허브 멤버가 없습니다.
                  </td>
                </tr>
              ) : (
                members.map((member) => {
                  const usage = usageByUser[member.userId]
                  const used = usage?.usedThisMonth ?? 0
                  const limit = usage?.monthlyLimit ?? DEFAULT_MONTHLY_TURNS
                  const pct = Math.min((used / Math.max(limit, 1)) * 100, 100)

                  return (
                    <tr
                      key={member.userId}
                      className={member.status === 'pending' ? 'bg-warning/5 hover:bg-warning/10 transition-colors' : 'hover:bg-surface-container-low transition-colors'}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-surface-dim flex items-center justify-center border border-outline-variant">
                            <span className="font-h3 text-h3 text-primary">
                              {member.displayName.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-h3 text-[14px] text-on-surface">{member.displayName}</p>
                            <p className="text-caption text-on-surface-variant">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-body text-body text-on-surface-variant">
                        {member.organization ?? '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-surface border border-outline-variant text-on-surface font-label text-label px-2 py-1 rounded-md capitalize">
                          {member.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`${statusClass(member.status)} font-label text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit`}>
                          <Icon name={statusIcon(member.status)} className="text-[12px]" />
                          {member.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-body text-body text-on-surface-variant">
                        {formatDate(member.createdAt)}
                      </td>
                      <td className="px-6 py-4">
                        {member.role === 'user' ? (
                          <div className="space-y-1.5 min-w-[180px]">
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
                                className="w-20 rounded-md border border-outline-variant bg-surface px-2 py-1 text-body-sm"
                                aria-label={`${member.displayName} 월 턴 한도`}
                              />
                              <button
                                type="button"
                                onClick={() => void saveUserLimit(member)}
                                disabled={updatingUserId === member.userId}
                                className="rounded-md bg-primary/10 px-2 py-1 text-label text-primary hover:bg-primary/20 disabled:opacity-60"
                              >
                                저장
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-caption text-on-surface-variant">Admin</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {member.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              className="bg-success text-white font-label text-label px-3 py-1.5 rounded-lg hover:opacity-90 transition-all flex items-center gap-1 shadow-sm disabled:opacity-60"
                              disabled={updatingUserId === member.userId}
                              onClick={() => void updateMember(member, 'approved')}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="bg-error/10 text-error border border-error/20 font-label text-label px-3 py-1.5 rounded-lg hover:bg-error/20 transition-all disabled:opacity-60"
                              disabled={updatingUserId === member.userId}
                              onClick={() => void updateMember(member, 'rejected')}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-caption text-on-surface-variant">
                            {member.approvedAt ? `Approved ${formatDate(member.approvedAt)}` : '-'}
                          </span>
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
    </main>
  )
}
