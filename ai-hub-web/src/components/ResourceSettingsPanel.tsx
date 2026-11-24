import { useEffect, useState } from 'react'
import { fetchResourceStatus, saveResourcePolicy, readWorkbookLocally, type ResourcePolicy } from '../lib/resourceExecution'
import { testBrowserResources } from '../lib/browserAudio'

export default function ResourceSettingsPanel() {
  const [policy, setPolicy] = useState<ResourcePolicy | null>(null)
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function refresh() {
    setBusy(true)
    try { const result = await fetchResourceStatus(); setPolicy(result.policy); setActive(result.active); setMessage('현재 서버 설정을 불러왔습니다.') }
    catch (error) { setMessage((error as Error).message) }
    finally { setBusy(false) }
  }
  useEffect(() => {
    let mounted = true
    void fetchResourceStatus().then(result => { if (mounted) { setPolicy(result.policy); setActive(result.active) } }).catch(error => { if (mounted) setMessage(error.message) })
    return () => { mounted = false }
  }, [])
  async function save() {
    if (!policy) return
    setBusy(true)
    try { setPolicy(await saveResourcePolicy(policy)); setMessage('저장했습니다. 다음 작업부터 적용됩니다. 진행 중인 작업은 기존 방식으로 완료됩니다.') }
    catch (error) { setMessage((error as Error).message) }
    finally { setBusy(false) }
  }
  async function test() {
    setBusy(true); setMessage('현재 PC에서 음성·엑셀 처리 기능을 확인하고 있습니다.')
    try {
      await testBrowserResources()
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['검사'], ['정상']]), '검사')
      const parsed = await readWorkbookLocally(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
      if (parsed.Sheets['검사']?.A2?.v !== '정상') throw new Error('엑셀 처리 검증 실패')
      setMessage('현재 PC에서 음성 변환·분할 및 엑셀 Worker 검증을 통과했습니다. 다른 사용자의 PC 성능은 다를 수 있습니다.')
    } catch (error) { setMessage((error as Error).message) }
    finally { setBusy(false) }
  }
  return <section aria-label="작업 자원 설정" className="mb-4 min-w-0 space-y-3 rounded-xl border border-outline-variant bg-surface-container p-4">
    <h2 className="font-semibold">작업 자원 설정</h2>
    <p className="text-sm">음성 전처리와 사용자 ERP 엑셀 읽기를 처리할 위치를 선택합니다. 공용 API 키·AI 호출·인증은 서버에서 관리하며, 공용 원본 검증·최종 병합은 중앙 서버에 유지합니다.</p>
    {policy && <div className="grid gap-3 sm:grid-cols-3">
      {([['audioMode', '음성 변환·분할'], ['workbookMode', '사용자 ERP 엑셀 읽기']] as const).map(([key, label]) => <label key={key} className="min-w-0 text-sm">{label}<select aria-label={label} value={policy[key]} disabled={busy} onChange={event => setPolicy({ ...policy, [key]: event.target.value as 'central' | 'user' })} className="mt-1 w-full min-w-0 rounded border bg-white p-2"><option value="central">중앙 서버 자원</option><option value="user">사용자 PC 자원</option></select></label>)}
      <label className="text-sm">서버 동시 작업 수 (1~4)<input aria-label="서버 동시 작업 수" type="number" min={1} max={4} step={1} value={policy.maxConcurrent} disabled={busy} onChange={event => setPolicy({ ...policy, maxConcurrent: Number(event.target.value) })} className="mt-1 w-full rounded border p-2" /></label>
    </div>}
    <p className="text-sm">조회 시 진행 중인 음성 인식·ERP 엑셀 읽기: {active}건. 한도 초과 시 재시도 안내가 표시됩니다. 사용자 PC 모드는 탭을 열어 두어야 하며, 지원하지 않는 파일은 중앙 처리 전환이 필요합니다. 외부 AI API 비용은 동일하게 발생합니다.</p>
    {policy && <label className="flex items-start gap-2 text-sm"><input type="checkbox" aria-label="모바일 고부하 작업 서버 처리" checked={policy.mobileHeavyToServer !== false} disabled={busy} onChange={event => setPolicy({ ...policy, mobileHeavyToServer: event.target.checked })} className="mt-1" /><span>모바일 고부하 작업은 서버에서 처리 (기본 켜짐). 음성 5MB 초과·3분 초과·길이 확인 불가, 엑셀 2MB 초과·압축 해제 예상 16MB 초과, 또는 CPU 논리 코어 2개 이하 기기에 적용합니다.</span></label>}
    <div className="flex flex-wrap gap-2">
      <button disabled={busy || !policy} onClick={() => void save()} className="rounded bg-primary px-3 py-2 text-white disabled:opacity-40">저장 및 적용</button>
      <button disabled={busy} onClick={() => void refresh()} className="rounded border px-3 py-2 disabled:opacity-40">서버 상태 확인</button>
      <button disabled={busy} onClick={() => void test()} className="rounded border px-3 py-2 disabled:opacity-40">현재 PC 처리 검사</button>
    </div>
    {message && <p role="status" className="break-words text-sm">{message}</p>}
  </section>
}
