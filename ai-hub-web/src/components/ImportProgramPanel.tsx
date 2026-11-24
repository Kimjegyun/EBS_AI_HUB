import { useEffect, useState } from 'react'
import { authHeaders, describeAuthStatus } from '../lib/authHeaders'

interface ImportJob {
  action: string
  status: 'running' | 'completed' | 'failed'
  startedAt: string
  finishedAt?: string
  error?: string
  results: Array<{ folder: string; id?: string; version?: string; status: string; error?: string }>
}
const labels: Record<string, string> = {
  checked: '폴더 검사 통과', packaged: '패키지 생성 완료', 'pending-review': '심사 제출 완료',
  'already-submitted': '이미 제출됨', failed: '실패',
}

export default function ImportProgramPanel({ onSubmitted }: { onSubmitted: () => void }) {
  const [job, setJob] = useState<ImportJob | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const res = await fetch('/api/apps/imports', { headers: authHeaders(), cache: 'no-store' })
        if (!res.ok) throw new Error(describeAuthStatus(res.status) || '파이프라인 서버에 연결하지 못했습니다.')
        const data = await res.json() as { job: ImportJob | null }
        if (!stopped) { setJob(data.job); setConnected(true); setError('') }
      } catch (e) {
        if (!stopped) { setError(e instanceof Error ? e.message : '상태 조회 실패'); setConnected(false) }
      } finally {
        if (!stopped) timer = setTimeout(() => void load(), 2000)
      }
    }
    void load()
    return () => { stopped = true; clearTimeout(timer) }
  }, [])

  const finished = job?.finishedAt
  const submitted = job?.action === 'submit'
  useEffect(() => { if (finished && submitted) onSubmitted() }, [finished, submitted, onSubmitted])

  const run = async (action: string) => {
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/apps/imports', {
        method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ action }),
      })
      const data = await res.json() as { job?: ImportJob; error?: string }
      if (!res.ok) throw new Error(describeAuthStatus(res.status) || data.error || '작업 시작 실패')
      if (data.job) setJob(data.job)
    } catch (e) { setError(e instanceof Error ? e.message : '작업 시작 실패') }
    finally { setSending(false) }
  }
  const busy = sending || job?.status === 'running'
  return (
    <section className="mb-5 rounded-xl border border-outline-variant bg-white p-4" aria-label="프로그램 가져오기">
      <h2 className="mb-2 text-lg font-semibold">프로그램 가져오기</h2>
      <p className="mb-3 text-sm text-on-surface-variant">
        AI Hub 서버의 import_program 폴더에 프로그램별 소스와 aihub-app.json을 넣으세요.
        폴더 검사 후 패키지를 생성하거나, 빌드부터 심사 제출까지 한 번에 실행할 수 있습니다.
        관리자 승인 후 마켓플레이스에 공유됩니다.
      </p>
      <div className="flex flex-wrap gap-2">
        {([['check', '폴더 검사'], ['build', '패키지 생성 실행'], ['submit', '빌드 후 자동 제출']] as const).map(([action, label]) => (
          <button key={action} type="button" disabled={busy || !connected} onClick={() => void run(action)}
            className="rounded-lg bg-primary px-3 py-2 text-sm text-white disabled:opacity-50">{label}</button>
        ))}
      </div>
      <div className="mt-3 text-sm" role="status" aria-live="polite">
        {busy ? '처리 중입니다. 페이지를 이동해도 서버에서 계속 실행합니다.' : job ? `최근 작업: ${job.status === 'completed' ? '완료' : '실패'}` : '작업 대기 중'}
      </div>
      {(error || job?.error) && <p className="mt-2 text-sm text-error" role="alert">{error || job?.error}</p>}
      {job && job.status !== 'running' && job.results.length === 0 && !job.error && <p className="mt-2 text-sm">검사할 프로그램 폴더가 없습니다.</p>}
      {!!job?.results.length && <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr><th className="p-2">폴더</th><th className="p-2">앱 / 버전</th><th className="p-2">결과</th></tr></thead>
        <tbody>{job.results.map((row) => <tr key={row.folder} className="border-t border-outline-variant">
          <td className="p-2">{row.folder}</td><td className="p-2">{row.id || '—'} {row.version}</td>
          <td className={`p-2 ${row.status === 'failed' ? 'text-error' : ''}`}>{labels[row.status] || row.status}{row.error && <div>{row.error}</div>}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  )
}
