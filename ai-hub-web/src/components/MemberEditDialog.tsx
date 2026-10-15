import { useState, type FormEvent } from 'react'
import { updateAiHubMemberProfile, type AiHubMember } from '../auth/supabaseMembership'
import { Icon } from './Icon'

type Props = {
  member: AiHubMember
  /** The signed-in admin edits their own row: role and status stay locked (the server enforces this too). */
  isSelf: boolean
  /** Only an owner may grant or remove the owner role (enforced server-side as well). */
  canManageOwner: boolean
  organizationOptions: string[]
  onClose: () => void
  onSaved: () => void
}

const inputClass = 'mt-1 block w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm text-on-surface outline-none focus:border-primary disabled:opacity-60'

/** Admin edit of a user's 이름·소속·부서·연락처·역할·상태. */
export default function MemberEditDialog({ member, isSelf, canManageOwner, organizationOptions, onClose, onSaved }: Props) {
  const [displayName, setDisplayName] = useState(member.displayName)
  const [realName, setRealName] = useState(member.realName ?? '')
  const [organization, setOrganization] = useState(member.organization ?? '')
  const [department, setDepartment] = useState(member.department ?? '')
  const [contactPhone, setContactPhone] = useState(member.contactPhone ?? '')
  const [role, setRole] = useState(member.role)
  const [status, setStatus] = useState(member.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ownerLocked = !canManageOwner && member.role === 'owner'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!displayName.trim()) { setError('이름을 입력해 주세요.'); return }
    setSaving(true)
    setError('')
    try {
      await updateAiHubMemberProfile({
        userId: member.userId,
        displayName: displayName.trim(),
        realName: realName.trim(),
        organization: organization.trim(),
        department: department.trim(),
        contactPhone: contactPhone.trim(),
        role,
        status,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '사용자 정보를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="사용자 정보 수정">
      <form onSubmit={(event) => void submit(event)} className="flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-surface shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
          <div className="min-w-0">
            <p className="font-h3 text-h3">사용자 정보 수정</p>
            <p className="truncate text-caption text-on-surface-variant">{member.email}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-container-high">
            <Icon name="close" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-3 text-caption text-on-surface-variant">
          <label className="block">이름(표시 이름) <span className="text-error">*</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} required className={inputClass} />
          </label>
          <label className="block">성명
            <input value={realName} onChange={(e) => setRealName(e.target.value)} maxLength={30} placeholder="예: 홍길동" autoComplete="off" className={inputClass} />
            <span className="mt-1 block text-[11px]">표시 이름이 영문 약자일 때 실제 성명을 적어 두면 사용자 목록에서 바로 알아볼 수 있습니다.</span>
          </label>
          <label className="block">소속(본부)
            <input value={organization} onChange={(e) => setOrganization(e.target.value)} maxLength={60} list="member-edit-orgs" placeholder="예: 융합기술본부" className={inputClass} />
            <datalist id="member-edit-orgs">{organizationOptions.map((org) => <option key={org} value={org} />)}</datalist>
          </label>
          <label className="block">부서
            <input value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={60} placeholder="예: 네트워크기술부" className={inputClass} />
          </label>
          <label className="block">연락처
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={30} inputMode="tel" placeholder="010-0000-0000" className={inputClass} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">역할
              <select value={role} onChange={(e) => setRole(e.target.value as AiHubMember['role'])} disabled={isSelf || ownerLocked} className={inputClass}>
                <option value="user">사용자</option>
                <option value="admin">관리자</option>
                <option value="owner" disabled={!canManageOwner}>소유자</option>
              </select>
            </label>
            <label className="block">상태
              <select value={status} onChange={(e) => setStatus(e.target.value as AiHubMember['status'])} disabled={isSelf || ownerLocked} className={inputClass}>
                <option value="approved">승인</option>
                <option value="pending">대기</option>
                <option value="rejected">거절</option>
              </select>
            </label>
          </div>
          {isSelf && <p>본인 계정의 역할과 상태는 변경할 수 없습니다.</p>}
          {ownerLocked && !isSelf && <p>소유자 계정의 역할과 상태는 소유자만 변경할 수 있습니다.</p>}
          {error && <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-error">{error}</p>}
        </div>

        <div className="flex gap-2 border-t border-outline-variant px-4 py-3">
          <button type="button" onClick={onClose} disabled={saving} className="flex-1 rounded-lg border border-outline-variant py-2.5 text-body-sm">취소</button>
          <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-primary py-2.5 text-body-sm font-semibold text-on-primary disabled:opacity-60">
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </div>
  )
}
