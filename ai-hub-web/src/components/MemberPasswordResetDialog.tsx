import { useState } from 'react'
import { generateTemporaryPassword, sendPasswordResetEmail } from '../auth/passwordReset'
import { resetAiHubMemberPassword, type AiHubMember } from '../auth/supabaseMembership'
import { Icon } from './Icon'

type Props = {
  member: AiHubMember
  onClose: () => void
  onDone: (notice: string) => void
}

const inputClass = 'block w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm text-on-surface outline-none focus:border-primary disabled:opacity-60'

/** Admin 비밀번호 초기화: issue a temporary password, or send the member a reset email. */
export default function MemberPasswordResetDialog({ member, onClose, onDone }: Props) {
  const [temporary, setTemporary] = useState(() => generateTemporaryPassword())
  const [applied, setApplied] = useState(false)
  const [busy, setBusy] = useState<'temp' | 'mail' | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function applyTemporary() {
    if (temporary.trim().length < 6) { setError('임시 비밀번호는 6자 이상이어야 합니다.'); return }
    if (!window.confirm(`${member.displayName} (${member.email})의 비밀번호를 임시 비밀번호로 바꿉니다.\n지금 로그인된 기기에서는 로그아웃됩니다. 계속할까요?`)) return
    setBusy('temp')
    setError('')
    try {
      await resetAiHubMemberPassword(member.userId, temporary.trim())
      setApplied(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '비밀번호를 초기화하지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  async function sendMail() {
    setBusy('mail')
    setError('')
    try {
      await sendPasswordResetEmail(member.email)
      onDone(`${member.email} 로 비밀번호 재설정 메일을 보냈습니다.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '재설정 메일을 보내지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(temporary.trim())
      setCopied(true)
    } catch {
      setError('복사하지 못했습니다. 직접 선택해 복사해 주세요.')
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="비밀번호 초기화">
      <div className="flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-surface shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
          <div className="min-w-0">
            <p className="font-h3 text-h3">비밀번호 초기화</p>
            <p className="truncate text-caption text-on-surface-variant">{member.displayName} · {member.email}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-container-high">
            <Icon name="close" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-3 text-caption text-on-surface-variant">
          {applied ? (
            <div className="space-y-2">
              <p className="rounded-lg bg-success/10 px-3 py-2 text-success">임시 비밀번호로 초기화했습니다. 아래 비밀번호를 사용자에게 직접 전달하세요. 이 창을 닫으면 다시 볼 수 없습니다.</p>
              <div className="flex gap-2">
                <input readOnly value={temporary} className={`${inputClass} font-mono tracking-wide`} onFocus={(e) => e.currentTarget.select()} aria-label="임시 비밀번호" />
                <button type="button" onClick={() => void copy()} className="shrink-0 rounded-lg border border-outline-variant px-3 text-body-sm hover:bg-surface-container-high">
                  {copied ? '복사됨' : '복사'}
                </button>
              </div>
              <p>사용자가 이 비밀번호로 로그인하면 새 비밀번호를 정하는 화면이 먼저 열립니다.</p>
            </div>
          ) : (
            <>
              <section className="space-y-2 rounded-xl border border-outline-variant p-3">
                <p className="font-label text-label text-on-surface">1. 임시 비밀번호 발급</p>
                <p>메일을 받기 어려운 사용자에게 씁니다. 로그인 후 바로 새 비밀번호로 바꾸게 됩니다.</p>
                <div className="flex gap-2">
                  <input value={temporary} onChange={(e) => setTemporary(e.target.value)} maxLength={72} className={`${inputClass} font-mono tracking-wide`} aria-label="임시 비밀번호" disabled={busy !== null} />
                  <button type="button" onClick={() => setTemporary(generateTemporaryPassword())} disabled={busy !== null} title="새로 만들기" aria-label="임시 비밀번호 새로 만들기" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-outline-variant hover:bg-surface-container-high disabled:opacity-60">
                    <Icon name="refresh" className="text-[18px]" />
                  </button>
                </div>
                <button type="button" onClick={() => void applyTemporary()} disabled={busy !== null} className="w-full rounded-lg bg-primary py-2.5 text-body-sm font-semibold text-on-primary disabled:opacity-60">
                  {busy === 'temp' ? '초기화 중…' : '임시 비밀번호로 초기화'}
                </button>
              </section>
              <section className="space-y-2 rounded-xl border border-outline-variant p-3">
                <p className="font-label text-label text-on-surface">2. 재설정 메일 보내기</p>
                <p>사용자의 이메일로 재설정 링크를 보냅니다. 링크를 누르면 사용자가 직접 새 비밀번호를 정합니다. 지금 비밀번호는 바뀌지 않습니다.</p>
                <button type="button" onClick={() => void sendMail()} disabled={busy !== null} className="w-full rounded-lg border border-primary/40 py-2.5 text-body-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-60">
                  {busy === 'mail' ? '보내는 중…' : '재설정 메일 보내기'}
                </button>
              </section>
            </>
          )}
          {error && <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-error">{error}</p>}
        </div>

        <div className="flex border-t border-outline-variant px-4 py-3">
          <button
            type="button"
            onClick={applied ? () => onDone(`${member.email} 사용자의 비밀번호를 임시 비밀번호로 초기화했습니다.`) : onClose}
            disabled={busy !== null}
            className="flex-1 rounded-lg border border-outline-variant py-2.5 text-body-sm"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
