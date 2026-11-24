import { useCallback, useEffect, useMemo, useState } from 'react'
import { listAiHubMembers, updateAiHubMember, type AiHubMember } from '../auth/supabaseMembership'
import { useAuth } from '../auth/AuthContext'
import AdminWebPushSettings from '../components/AdminWebPushSettings'
import { Icon } from '../components/Icon'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function formatSignupDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '신청일 확인 불가'
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

export default function AdminApprovalAppPage() {
  const { session, logout } = useAuth()
  const [members, setMembers] = useState<AiHubMember[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)

  const loadMembers = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      setMembers(await listAiHubMembers())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '가입 신청 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadMembers()
    const onServiceWorkerMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type !== 'AI_HUB_ADMIN_SIGNUP_PENDING') return
      setNotice('새 가입 신청이 도착했습니다. 승인 대기 목록을 갱신했습니다.')
      void loadMembers(true)
    }
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage)
    const onInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onInstallPrompt)
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage)
      window.removeEventListener('beforeinstallprompt', onInstallPrompt)
    }
  }, [loadMembers])

  const pendingMembers = useMemo(() => members
    .filter((member) => member.status === 'pending')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), [members])

  const decide = async (member: AiHubMember, status: 'approved' | 'rejected') => {
    setBusyId(member.userId)
    setError('')
    setNotice('')
    try {
      const outcome = await updateAiHubMember({ userId: member.userId, status, role: member.role })
      if (status === 'rejected') {
        setNotice(`${member.displayName}님의 가입 신청을 거절했습니다.`)
      } else if (outcome === 'already-approved') {
        setNotice(`${member.email} 계정은 다른 관리자가 이미 승인했습니다.`)
      } else if (outcome === 'already-approved-notification-warning') {
        setNotice(`${member.email} 계정은 이미 승인됐습니다. 관리자 완료 메일 발송은 확인이 필요합니다.`)
      } else if (outcome === 'approved-notification-warning') {
        setNotice(`${member.displayName}님을 승인했지만 알림 메일 일부를 보내지 못했습니다.`)
      } else if (outcome === 'approved') {
        setNotice(`${member.displayName}님을 승인했고 관리자 및 가입자에게 메일을 보냈습니다.`)
      } else {
        setNotice('신청 상태가 변경됐습니다. 목록을 새로 확인했습니다.')
      }
      await loadMembers(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '가입 상태를 변경하지 못했습니다.')
      await loadMembers(true)
    } finally {
      setBusyId(null)
    }
  }

  const install = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setNotice('홈 화면에 AI HUB 승인 앱을 추가했습니다.')
    setInstallPrompt(null)
  }

  return (
    <main className="min-h-screen bg-background text-on-surface">
      <header className="sticky top-0 z-10 border-b border-outline-variant bg-surface-container/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary-container text-on-primary-container shadow-md shadow-black/20">
              <Icon name="how_to_reg" className="text-[22px]" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary-light">EBS AI HUB</p>
              <h1 className="text-base font-bold leading-tight">가입 승인 센터</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {installPrompt && (
              <button onClick={() => void install()} className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-on-primary shadow-sm">
                앱 설치
              </button>
            )}
            <button onClick={logout} aria-label="로그아웃" className="grid h-10 w-10 place-items-center rounded-xl text-on-surface-variant hover:bg-surface-container-high">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-4 px-4 pb-10 pt-5">
        <section className="overflow-hidden rounded-3xl border border-outline-variant bg-gradient-to-br from-[#202622] via-[#29362e] to-[#394a3e] p-5 text-on-surface shadow-lg shadow-black/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-primary-light">안녕하세요, {session?.displayName || '관리자'}님</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight">가입 신청을 확인하세요</h2>
              <p className="mt-2 text-sm text-on-surface-variant">새 가입 알림이 도착하면 목록을 바로 갱신합니다.</p>
            </div>
            <button onClick={() => void loadMembers(true)} disabled={refreshing} aria-label="새로고침" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 hover:bg-white/20 disabled:opacity-60">
              <Icon name="refresh" className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="mt-5 flex items-end gap-2">
            <span className="text-5xl font-black tabular-nums">{loading ? '—' : pendingMembers.length}</span>
            <span className="pb-1 text-sm font-semibold text-on-surface-variant">승인 대기</span>
          </div>
        </section>

        <AdminWebPushSettings />

        {notice && <div role="status" className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success">{notice}</div>}
        {error && <div role="alert" className="rounded-2xl border border-error/30 bg-error-container/50 px-4 py-3 text-sm font-medium text-error">{error}</div>}

        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-extrabold">승인 대기 목록</h2>
            <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-bold text-warning">{pendingMembers.length}명</span>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-outline-variant bg-white p-8 text-center text-sm text-on-surface-variant">신청 목록을 불러오는 중입니다.</div>
          ) : pendingMembers.length === 0 ? (
            <div className="rounded-3xl border border-outline-variant bg-white px-5 py-10 text-center shadow-sm">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-success/10 text-success"><Icon name="task_alt" className="text-3xl" /></div>
              <h3 className="mt-4 font-bold">대기 중인 신청이 없습니다</h3>
              <p className="mt-1 text-sm text-on-surface-variant">새 가입 신청이 들어오면 이 화면과 휴대폰 알림에 표시됩니다.</p>
            </div>
          ) : pendingMembers.map((member) => (
            <article key={member.userId} className="rounded-3xl border border-outline-variant bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-lg font-extrabold text-primary-light">
                  {(member.displayName || member.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-bold">{member.displayName || '이름 미입력'}</h3>
                    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-bold text-warning">승인 대기</span>
                  </div>
                  <p className="mt-1 break-all text-sm text-on-surface-variant">{member.email}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">{member.organization || '소속 미입력'} · {formatSignupDate(member.createdAt)}</p>
                  {member.emailConfirmed === false && <p className="mt-2 text-xs font-semibold text-warning">이메일 인증을 기다리는 중입니다.</p>}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busyId === member.userId || member.emailConfirmed === false}
                  onClick={() => void decide(member, 'approved')}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-4 font-bold text-on-primary shadow-sm hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon name="check_circle" /> 승인
                </button>
                <button
                  type="button"
                  disabled={busyId === member.userId}
                  onClick={() => void decide(member, 'rejected')}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-outline-variant bg-white px-4 font-bold text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
                >
                  <Icon name="close" /> 거절
                </button>
              </div>
            </article>
          ))}
        </section>

        <footer className="px-1 pt-2 text-center text-xs leading-5 text-on-surface-variant">
          이 앱은 EBS AI HUB 관리자의 가입 승인 전용 화면입니다.<br />
          설치는 무료이며, 알림은 켜 둔 관리자 기기로 전달됩니다.<br />
          설치하려면 Chrome 메뉴 ⋮에서 앱 설치 또는 홈 화면에 추가를 선택하세요.
        </footer>
      </div>
    </main>
  )
}
