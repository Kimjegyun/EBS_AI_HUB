import { surveyDepartment } from '../../../server/src/services/surveyDepartment'
import { useEffect, useState, type ReactNode } from 'react'
import { fetchExportResults } from './inventoryApiClient'
import { listAiHubMembers } from '../../auth/supabaseMembership'
import { formatSurveyDateTime } from '../../../server/src/services/surveyDateTime'

const PREVIEW_PAGE = 100

/**
 * Exports merged server results as Excel, filtered by 본부·조사부서·입력자.
 * `showPreview` (admin screens) also lists the matching assets below the filters,
 * with search, so the selection can be checked before downloading.
 */
export default function PublishedSubmissionDownload({ children, showPreview = false }: { children?: ReactNode; showPreview?: boolean } = {}) {
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchExportResults>>>([])
  const [headquarters, setHeadquarters] = useState('')
  const [dept, setDept] = useState('')
  const [person, setPerson] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [visible, setVisible] = useState(PREVIEW_PAGE)
  const [onlySearched, setOnlySearched] = useState(true)
  // 입력자 is the name used at survey time, often an English short form ("kjg").
  // Admin screens show the 성명 kept in 사용자 관리 alongside it: "김제균 (kjg)".
  const [realNames, setRealNames] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    if (!showPreview) return
    let active = true
    void listAiHubMembers().then(members => {
      if (!active) return
      const names = new Map<string, string>()
      for (const member of members) {
        const realName = member.realName?.trim()
        if (!realName) continue
        for (const alias of [member.displayName, member.email.split('@')[0]]) if (alias?.trim() && alias.trim() !== realName) names.set(alias.trim(), realName)
      }
      setRealNames(names)
    }).catch(() => { /* names stay as entered */ })
    return () => { active = false }
  }, [showPreview])
  const personLabel = (name: string) => { const realName = realNames.get(name.trim()); return realName ? `${realName} (${name})` : name }
  // Clears the shown results before a new load; called from the year input and 새로고침
  // (not inside the effect, so loading never triggers a cascading render).
  const startLoad = (nextYear: string) => {
    setRows([]); setMessage(''); setError(''); setVisible(PREVIEW_PAGE)
    setLoading(/^20\d{2}$/.test(nextYear))
  }
  useEffect(() => {
    if (!/^20\d{2}$/.test(year)) return
    let active = true
    void fetchExportResults(year)
      .then(data => { if (active) setRows(data) })
      .catch(error => { if (active) setError(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [year, refresh])
  const headquartersOptions = [...new Set(rows.map(row => row.parentDept).filter(Boolean))].sort()
  const headquartersRows = rows.filter(row => !headquarters || row.parentDept === headquarters)
  const departments = [...new Set(headquartersRows.map(row => surveyDepartment(row.verifierDept, row.parentDept)).filter(Boolean))].sort()
  const people = [...new Set(headquartersRows.filter(row => !dept || surveyDepartment(row.verifierDept, row.parentDept) === dept).map(row => row.verifier).filter(Boolean))].sort()
  const selectedHeadquarters = headquarters
  const selectedDept = dept
  const selectedPerson = person
  const matchesFilters = (row: (typeof rows)[number]) => (!selectedHeadquarters || row.parentDept === selectedHeadquarters) && (!selectedDept || surveyDepartment(row.verifierDept, row.parentDept) === selectedDept) && (!selectedPerson || row.verifier === selectedPerson)
  const query = search.trim().toLowerCase()
  const matchesSearch = (row: (typeof rows)[number]) => !query || [row.assetNo, row.name, row.location, row.dept, row.model].some(value => String(value ?? '').toLowerCase().includes(query))
  const filteredRows = rows.filter(matchesFilters)
  const count = filteredRows.length
  const previewRows = filteredRows.filter(matchesSearch).sort((a, b) => String(b.surveyedAt ?? '').localeCompare(String(a.surveyedAt ?? '')))
  const exportSearched = showPreview && !!query && onlySearched
  const validYear = /^20\d{2}$/.test(year)
  const disabled = busy || loading || !validYear || !!error
  const download = async () => {
    if (!/^20\d{2}$/.test(year)) { setMessage('조사연도를 네 자리로 입력해 주세요.'); return }
    if (disabled || !count) return
    setBusy(true); setMessage('최신 서버 결과를 확인하고 있습니다…')
    try {
      const latest = await fetchExportResults(year)
      setRows(latest)
      const { buildResultExport } = await import('./resultExport')
      // Exactly the rows shown (filters, and the search when chosen), with 입력자 as 성명 (ID).
      const selectedRows = latest.filter(row => matchesFilters(row) && (!exportSearched || matchesSearch(row)))
      const output = await buildResultExport(selectedRows.map(row => ({ ...row, verifier: personLabel(row.verifier ?? '') })), '', '', '')
      const safe = (value: string) => value.replace(/[\\/:*?"<>|]/g, '_')
      const { saveAs } = await import('file-saver')
      saveAs(new Blob([output.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `재물조사_${year}_${[selectedHeadquarters, selectedDept, selectedPerson && personLabel(selectedPerson)].filter(Boolean).map(safe).join('_') || '전체'}${exportSearched ? `_검색_${safe(search.trim())}` : ''}.xlsx`)
      setMessage(`${output.count}건 내보내기 완료`)
    } catch (error) { setMessage((error as Error).message) }
    finally { setBusy(false) }
  }
  return <section aria-label="서버 조사 결과 엑셀 내보내기" aria-busy={loading || busy} className="min-w-0 rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
    <div className="flex items-center justify-between gap-2">
      <strong className="min-w-0 text-body-sm">서버 조사 결과 엑셀 내보내기</strong>
      <button type="button" disabled={busy || loading || !validYear} onClick={() => { startLoad(year); setRefresh(value => value + 1) }} className="shrink-0 text-caption text-primary disabled:opacity-50">새로고침</button>
    </div>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <label className="block min-w-0 space-y-1 text-caption text-on-surface-variant">
        <span>조사연도</span>
        <input aria-label="조사연도" className={controlClass} value={year} onChange={e => { startLoad(e.target.value); setYear(e.target.value); setHeadquarters(''); setDept(''); setPerson('') }} inputMode="numeric" maxLength={4} disabled={busy} />
      </label>
      <FilterSelect label="본부" value={headquarters} options={headquartersOptions} allLabel="전체 본부" disabled={disabled} onChange={value => { setHeadquarters(value); setDept(''); setPerson(''); setMessage(''); setVisible(PREVIEW_PAGE) }} />
      <FilterSelect label="조사부서" value={dept} options={departments} allLabel="전체 부서" disabled={disabled} onChange={value => { setDept(value); setPerson(''); setMessage(''); setVisible(PREVIEW_PAGE) }} />
      <FilterSelect label="입력자" value={person} options={people} labelOf={personLabel} allLabel="전체 입력자" disabled={disabled} onChange={value => { setPerson(value); setMessage(''); setVisible(PREVIEW_PAGE) }} />
    </div>
    <p className="break-words text-caption text-on-surface-variant">본부별·부서별·개인별로 선택하세요. ‘전체’로 두면 해당 조건은 제한하지 않습니다.</p>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="min-w-0 break-words text-caption" role="status">
        {loading ? '서버 결과 불러오는 중…' : !validYear ? '조사연도를 네 자리로 입력해 주세요.' : error ? '서버 결과를 불러오지 못했습니다.' : <>{[headquarters || '전체 본부', dept || '전체 부서', person || '전체 입력자'].join(' · ')}<br /><strong>선택 결과 {count}건</strong>{count === 0 && ' · 해당 조건의 서버 반영 결과가 없습니다.'}</>}
      </p>
      <button type="button" disabled={disabled || !count} onClick={() => void download()} className="w-full shrink-0 rounded-lg bg-primary px-3 py-2 text-body-sm font-semibold text-on-primary disabled:opacity-50 sm:w-auto">{busy ? '다운로드 중…' : '엑셀 다운로드'}</button>
    </div>
    <p className="text-caption text-on-surface-variant">서버에 반영된 확인 결과만 포함됩니다. 부서는 조사부서, 개인은 입력자(확인자 이름) 기준입니다.</p>
    {showPreview && validYear && !loading && !error && count > 0 && (
      <div className="space-y-2 border-t border-primary/20 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-body-sm">등록된 자산 {previewRows.length.toLocaleString()}건{query ? ` / ${count.toLocaleString()}건` : ''}</strong>
          <input value={search} onChange={event => { setSearch(event.target.value); setVisible(PREVIEW_PAGE) }} placeholder="자산번호·자산명·위치 검색" aria-label="등록 자산 검색" className="ml-auto min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-1.5 text-body-sm sm:max-w-xs" />
        </div>
        {query && <label className="flex items-center gap-1.5 text-caption"><input type="checkbox" checked={onlySearched} onChange={event => setOnlySearched(event.target.checked)} /> 엑셀 다운로드도 검색 결과만</label>}
        <div className="max-h-[420px] overflow-auto rounded-lg border border-outline-variant bg-surface">
          <table className="w-full min-w-[760px] border-collapse text-left text-caption">
            <thead className="sticky top-0 bg-surface-container-low">
              <tr>{['본부', '조사부서', '입력자', '자산번호', '자산명', '설치부서', '위치', '상태', '조사일시'].map(label => <th key={label} className="whitespace-nowrap px-2 py-1.5 font-semibold text-on-surface-variant">{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {previewRows.slice(0, visible).map(row => (
                <tr key={`${row.parentDept}:${row.assetNo}`} className="hover:bg-surface-container-low">
                  <td className="whitespace-nowrap px-2 py-1">{row.parentDept}</td>
                  <td className="whitespace-nowrap px-2 py-1">{surveyDepartment(row.verifierDept, row.parentDept)}</td>
                  <td className="whitespace-nowrap px-2 py-1">{personLabel(row.verifier ?? '')}</td>
                  <td className="whitespace-nowrap px-2 py-1 font-medium">{row.assetNo}</td>
                  <td className="px-2 py-1">{row.name}</td>
                  <td className="whitespace-nowrap px-2 py-1">{row.dept}</td>
                  <td className="px-2 py-1">{row.location}</td>
                  <td className="whitespace-nowrap px-2 py-1">{row.status}</td>
                  <td className="whitespace-nowrap px-2 py-1">{formatSurveyDateTime(row.surveyedAt)}</td>
                </tr>
              ))}
              {!previewRows.length && <tr><td colSpan={9} className="px-2 py-3 text-center text-on-surface-variant">검색 결과가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
        {previewRows.length > visible && (
          <button type="button" onClick={() => setVisible(value => value + PREVIEW_PAGE)} className="w-full rounded-lg border border-outline-variant py-1.5 text-caption">
            더 보기 ({visible.toLocaleString()} / {previewRows.length.toLocaleString()})
          </button>
        )}
      </div>
    )}
    {error && <p className="break-words text-caption text-error" role="alert">{error} · 새로고침으로 다시 시도해 주세요.</p>}
    {message && <p className="text-caption" role="status">{message}</p>}
    {children && <details className="border-t border-primary/20 pt-2 text-caption"><summary className="cursor-pointer">현재 기기 저장 결과 내보내기 (서버 미반영 포함)</summary>{children}</details>}
  </section>
}

const controlClass = 'block w-full min-w-0 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-[16px] leading-6 text-on-surface disabled:opacity-50'

function FilterSelect({ label, value, options, labelOf = (option: string) => option, allLabel, disabled, onChange }: {
  label: string; value: string; options: string[]; labelOf?: (option: string) => string; allLabel: string; disabled: boolean; onChange: (value: string) => void
}) {
  // Keep a vanished filter visible after refresh rather than silently displaying "전체".
  const visibleOptions = value && !options.includes(value) ? [value, ...options] : options
  return <label className="block min-w-0 space-y-1 text-caption text-on-surface-variant">
    <span>{label}</span>
    <span className="relative block min-w-0">
      <select aria-label={label} className={`${controlClass} appearance-none pr-8`} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {visibleOptions.map(option => <option key={option} value={option}>{labelOf(option)}</option>)}
      </select>
    </span>
  </label>
}
