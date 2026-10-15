import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { fetchCompanyWorkbook, saveBlobAs } from './inventoryApiClient'

/**
 * Admin-only: downloads the 전사 재물조사 workbook — the 운영관리부 master with all
 * 본부 sheets filled from the merged server results. Render only for admins; the
 * server endpoint also rejects non-admin tokens.
 */
export default function CompanyWorkbookDownload() {
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const validYear = /^20\d{2}$/.test(year)

  const download = async () => {
    if (!validYear || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const file = await fetchCompanyWorkbook(year)
      saveBlobAs(file.blob, file.fileName)
      setMessage({ ok: true, text: `${file.fileName} · ${file.headquarters}개 본부 · 확인 ${file.confirmed.toLocaleString()}건 반영` })
    } catch (error) {
      setMessage({ ok: false, text: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="전사 재물조사 엑셀" className="rounded-lg border border-secondary/30 bg-secondary/5 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="corporate_fare" className="text-secondary" />
        <strong className="text-body-sm">전사 재물조사 엑셀</strong>
        <span className="rounded bg-secondary/15 px-1.5 py-0.5 text-[10px] font-semibold text-secondary">관리자</span>
      </div>
      <p className="text-caption text-on-surface-variant">
        운영관리부 원본의 모든 본부 시트에 서버 조사 결과(조사부서·조사자·조사일시·확인완료)를 반영한 파일입니다.
      </p>
      <div className="flex items-end gap-2">
        <label className="block w-28 shrink-0 space-y-1 text-caption text-on-surface-variant">
          <span>조사연도</span>
          <input aria-label="전사 조사연도" value={year} onChange={(e) => { setYear(e.target.value); setMessage(null) }} inputMode="numeric" maxLength={4} disabled={busy}
            className="block w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-[16px] leading-6 text-on-surface disabled:opacity-50" />
        </label>
        <button type="button" onClick={() => void download()} disabled={!validYear || busy}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-body-sm font-semibold text-white disabled:opacity-50">
          <Icon name={busy ? 'progress_activity' : 'download'} className={`text-[18px] ${busy ? 'animate-spin' : ''}`} />
          {busy ? '만드는 중…' : '전사 엑셀 다운로드'}
        </button>
      </div>
      {!validYear && <p className="text-caption text-error">조사연도를 네 자리로 입력해 주세요.</p>}
      {message && <p role={message.ok ? 'status' : 'alert'} className={`break-words text-caption ${message.ok ? 'text-on-surface' : 'text-error'}`}>{message.text}</p>}
    </section>
  )
}
