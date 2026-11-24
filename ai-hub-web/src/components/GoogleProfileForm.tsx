import { useState, type FormEvent } from 'react'
import type { AuthSession } from '../auth/types'
import { getAiHubSession } from '../auth/supabaseMembership'
import { supabase } from '../lib/supabase'

export default function GoogleProfileForm({ session, onComplete }: {
  session: AuthSession
  onComplete: (session: AuthSession) => void
}) {
  const [headquarters, setHeadquarters] = useState(session.organization ?? '')
  const [department, setDepartment] = useState(session.department ?? '')
  const [phone, setPhone] = useState(session.contactPhone ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const values = [headquarters.trim(), department.trim(), phone.trim()]
    if (values.some(value => !value)) { setError('소속본부, 소속부서, 연락처를 모두 입력해 주세요.'); return }
    if (!/^[+\d\s()-]+$/.test(values[2]) || !/^\d{9,15}$/.test(values[2].replace(/\D/g, ''))) {
      setError('연락처를 올바른 전화번호로 입력해 주세요.'); return
    }
    setBusy(true); setError('')
    try {
      if (!supabase) throw new Error('로그인 연결 설정을 확인해 주세요.')
      const current = await getAiHubSession()
      if (current?.userId !== session.userId || current?.status !== 'approved') {
        throw new Error('승인된 계정으로 다시 로그인해 주세요.')
      }
      const result = await supabase.auth.updateUser({ data: {
        headquarters: values[0], department: values[1], contact_phone: values[2],
      } })
      if (result.error) throw result.error
      const next = await getAiHubSession()
      if (!next || next.status !== 'approved' || next.needsGoogleProfile) throw new Error('저장된 정보를 확인하지 못했습니다. 다시 시도해 주세요.')
      onComplete(next)
    } catch (err) { setError(err instanceof Error ? err.message : '저장하지 못했습니다. 다시 시도해 주세요.') }
    finally { setBusy(false) }
  }

  return <main className="min-h-screen bg-background p-6 flex items-center justify-center">
    <form onSubmit={save} className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface p-6 space-y-5">
      <h1 className="text-2xl font-bold">소속 및 연락처 입력</h1>
      <p>소속본부, 소속부서, 연락처를 입력해 주세요. 세 항목을 모두 저장할 때까지 로그인할 때마다 이 화면이 표시됩니다.</p>
      <p className="text-sm text-on-surface-variant">{session.email}</p>
      <fieldset disabled={busy} className="space-y-4">
        <label className="block">소속본부<input required maxLength={60} autoComplete="organization" value={headquarters} onChange={e => setHeadquarters(e.target.value)} className="block w-full rounded border p-2 bg-surface" /></label>
        <label className="block">소속부서<input required maxLength={60} value={department} onChange={e => setDepartment(e.target.value)} className="block w-full rounded border p-2 bg-surface" /></label>
        <label className="block">연락처<input required type="tel" autoComplete="tel" maxLength={30} value={phone} onChange={e => setPhone(e.target.value)} className="block w-full rounded border p-2 bg-surface" /></label>
        {error && <p role="alert" className="text-error">{error}</p>}
        <button className="w-full rounded-lg bg-primary text-white p-3 disabled:opacity-50">{busy ? '저장 중…' : '저장하고 계속하기'}</button>
      </fieldset>
    </form>
  </main>
}
