// 재물조사 앱 — DB 파일 관리 패널 (관리자 전용)
//
// 두 엑셀을 올리면 본부별 자산 데이터셋이 만들어지고, 그 즉시 앱에 반영됩니다.
//   ① 운영관리부 전사 자산 현황 : 엑셀 — 본부별 시트로 구성된 전사 양식
//   ② 본부별 ERP 자산 현황 : 엑셀    — 본부 하나의 ERP 자산 목록
// 서버가 두 파일을 자산번호로 병합해 inventory_datasets 에 본부별 데이터셋을 만듭니다.
//
// 화면 상태의 출처는 전부 서버입니다. 예전에는 전사 양식이 React state와 서버 메모리
// 캐시(2시간)에만 있어서 새로고침하거나 서버가 재시작하면 "미첨부"로 돌아갔습니다.

import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import {
  deleteServerDataset,
  deleteSurveyForm,
  fetchAllErpFiles,
  fetchServerDatasets,
  fetchSurveyForm,
  mergeByUploadId,
  saveNgrokToken,
  uploadSurveyForm,
  type ErpFileMeta,
  type ServerDatasetMeta,
  type SurveyFormMeta,
} from './inventoryApiClient'

// ── 시트 제외 패턴 ────────────────────────────────────────────────────────────
// 본부가 아닌 안내성 시트는 기본으로 감춥니다.
const SKIP_SHEET_PATTERNS = [
  /^전사$/i, /^목차$/i, /^안내$/i, /^작성방법$/i, /^상위부서/i,
  /raw\s*data/i, /재물조사대상/i,
]
function isSkipSheet(name: string): boolean {
  return SKIP_SHEET_PATTERNS.some((p) => p.test(name.trim()))
}

type Tone = 'ok' | 'error'

// ── 드롭존 ────────────────────────────────────────────────────────────────────
function DropZone({
  label, hint, file, accept, onChange, icon, disabled,
}: {
  label: string; hint?: string; file: File | null; accept?: string
  onChange: (f: File | null) => void; icon?: string; disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  return (
    <div
      className={`relative rounded-xl border-2 border-dashed p-4 text-center transition-colors select-none
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${dragging ? 'border-primary bg-primary/5' : file ? 'border-success/50 bg-success/4' : 'border-outline-variant hover:border-primary/50 hover:bg-surface-container-high/50'}`}
      onClick={() => !disabled && ref.current?.click()}
      onDragOver={(e) => { if (!disabled) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (disabled) return
        e.preventDefault(); setDragging(false)
        const f = e.dataTransfer.files[0]; if (f) onChange(f)
      }}
    >
      <input ref={ref} type="file" accept={accept ?? '.xlsx'} className="hidden" disabled={disabled}
        onChange={(e) => { const f = e.target.files?.[0] ?? null; e.target.value = ''; onChange(f) }} />
      {file ? (
        <div className="flex items-center justify-center gap-2">
          <Icon name="check_circle" className="text-success text-[20px]" />
          <div className="text-left min-w-0">
            <p className="text-body-sm font-medium text-on-surface truncate max-w-[240px]">{file.name}</p>
            <p className="text-caption text-on-surface-variant">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(null) }}
            className="ml-auto shrink-0 p-1 rounded-full text-on-surface-variant hover:bg-error/10 hover:text-error">
            <Icon name="close" className="text-[16px]" />
          </button>
        </div>
      ) : (
        <div className="py-1">
          <Icon name={icon ?? 'upload_file'} className="text-[28px] text-on-surface-variant/40 mb-1" />
          <p className="text-body-sm font-medium text-on-surface">{label}</p>
          {hint && <p className="text-caption text-on-surface-variant/70 mt-0.5">{hint}</p>}
          <p className="text-[10px] text-on-surface-variant/50 mt-1">클릭하거나 드래그하세요</p>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ② 본부 한 줄 — ERP 파일 첨부 → 데이터셋 등록/삭제
// ══════════════════════════════════════════════════════════════════════════════

function DivisionRow({
  sheetName, formId, dataset, storedErp, onChanged, onMessage,
}: {
  sheetName: string
  formId: string
  dataset?: ServerDatasetMeta
  /** 서버에 보관된 ERP 원본 — 현장 앱이 자동으로 받아 씁니다. */
  storedErp?: ErpFileMeta
  onChanged: () => Promise<void>
  onMessage: (tone: Tone, text: string) => void
}) {
  const [erpFile, setErpFile] = useState<File | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState<'merge' | 'delete' | null>(null)

  const register = async () => {
    if (!erpFile) return
    setBusy('merge')
    try {
      const res = await mergeByUploadId({
        uploadId: formId,
        erpFile,
        sheetName,
        title: sheetName,
        parentDept: sheetName,
        id: dataset?.id, // 이미 있으면 같은 데이터셋을 덮어씁니다.
      })
      if (!res.ok) { onMessage('error', `${sheetName} 등록 실패: ${res.error}`); return }
      const st = res.stats
      onMessage('ok', st
        ? `${sheetName} 등록 완료 — 총 ${res.assetCount?.toLocaleString()}건 (병합 ${st.merged} · 양식만 ${st.surveyOnly} · ERP만 ${st.erpOnly})`
        : `${sheetName} 등록 완료 — 총 ${res.assetCount?.toLocaleString()}건`)
      setErpFile(null)
      setExpanded(false)
      await onChanged()
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!dataset) return
    if (!window.confirm(`${dataset.title} 데이터셋을 삭제할까요?\n\n자산 ${dataset.assetCount.toLocaleString()}건이 사라지며 되돌릴 수 없습니다.`)) return
    setBusy('delete')
    try {
      let res = await deleteServerDataset(dataset.id)
      if (res.needsForce) {
        const ok = window.confirm(
          `이 데이터셋을 사용하는 조사 세션이 ${res.sessionCount}건 있습니다.\n` +
          '삭제해도 세션은 남지만 자산 목록을 불러오지 못하게 됩니다.\n\n그래도 삭제할까요?',
        )
        if (!ok) return
        res = await deleteServerDataset(dataset.id, true)
      }
      if (!res.ok) { onMessage('error', `삭제 실패: ${res.error}`); return }
      onMessage('ok', `삭제됨 — ${dataset.title}`)
      await onChanged()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <Icon
          name={dataset ? 'check_circle' : 'radio_button_unchecked'}
          className={`text-[16px] shrink-0 ${dataset ? 'text-success' : 'text-on-surface-variant/30'}`}
        />
        <span className="flex-1 min-w-0 text-body-sm font-medium text-on-surface truncate">{sheetName}</span>

        {dataset && (
          <>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/12 text-success font-semibold shrink-0">
              {dataset.assetCount.toLocaleString()}건
            </span>
            <span className="hidden sm:inline text-[10px] text-on-surface-variant shrink-0">
              {dataset.uploadedAt.slice(0, 10)}
            </span>
          </>
        )}

        <button type="button" onClick={() => setExpanded((v) => !v)} disabled={busy !== null}
          className={`shrink-0 h-6 rounded px-2 text-[11px] flex items-center gap-0.5 transition-colors disabled:opacity-50
            ${dataset ? 'bg-primary/8 text-primary hover:bg-primary/16' : 'bg-primary/15 text-primary hover:bg-primary/25'}`}>
          <Icon name="upload" className="text-[12px]" />
          {dataset ? 'ERP 재업로드' : 'ERP 업로드'}
        </button>

        {dataset && (
          <button type="button" onClick={() => void remove()} disabled={busy !== null} title="데이터셋 삭제"
            className="shrink-0 p-1 rounded text-on-surface-variant/40 hover:text-error hover:bg-error/8 disabled:opacity-50">
            <Icon name={busy === 'delete' ? 'progress_activity' : 'delete'}
              className={`text-[15px] ${busy === 'delete' ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-outline-variant/50 px-3 pb-3 pt-2 space-y-2 bg-surface-container-low/40">
          <p className="text-caption text-on-surface-variant">
            <strong>{sheetName}</strong> 본부의 ERP 자산현황 파일을 첨부하세요.
          </p>
            {dataset && (
              storedErp ? (
                <p className="flex items-center gap-1 text-[11px] text-success">
                  <Icon name="cloud_done" className="text-[13px]" />
                  현장 앱 자동 로드용 원본 보관됨 — {storedErp.fileName}
                </p>
              ) : (
                <p className="flex items-start gap-1 text-[11px] leading-relaxed text-warning">
                  <Icon name="cloud_off" className="mt-0.5 shrink-0 text-[13px]" />
                  ERP 원본이 서버에 없습니다. 이 기능이 생기기 전에 등록된 데이터셋이라 그렇습니다 —
                  ERP 파일을 한 번 다시 올리면 현장 앱이 자동으로 받아 씁니다.
                </p>
              )
            )}
          <DropZone label="② 본부별 ERP 자산 현황 (.xlsx)" hint={`${sheetName} 자산 목록`}
            icon="storage" file={erpFile} onChange={setErpFile} disabled={busy !== null} />
          {erpFile && (
            <button type="button" onClick={() => void register()} disabled={busy !== null}
              className="w-full h-8 rounded-md bg-primary text-on-primary text-body-sm font-medium flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-50">
              {busy === 'merge'
                ? <><Icon name="progress_activity" className="animate-spin text-[14px]" />병합 중...</>
                : <><Icon name="merge" className="text-[14px]" />{dataset ? '덮어쓰기 등록' : '데이터셋 등록'}</>
              }
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── ngrok 토큰 입력 섹션 ────────────────────────────────────────────────────
function NgrokTokenSection() {
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSave = async () => {
    if (!token.trim()) return
    setStatus('saving'); setErrorMsg('')
    const res = await saveNgrokToken(token.trim())
    if (res.ok) { setStatus('ok'); setToken('') }
    else { setStatus('error'); setErrorMsg(res.error ?? '알 수 없는 오류') }
  }

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-surface-container-low border-b border-outline-variant">
        <Icon name="vpn_key" className="text-primary text-[16px]" />
        <span className="text-body-sm font-semibold text-on-surface flex-1">ngrok 터널 인증 토큰</span>
        <a
          href="https://dashboard.ngrok.com/get-started/your-authtoken"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
        >
          토큰 발급
          <Icon name="open_in_new" className="text-[11px]" />
        </a>
      </div>
      <div className="px-3 py-3 space-y-2">
        <p className="text-caption text-on-surface-variant">
          <a href="https://ngrok.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ngrok.com</a> 무료 계정 가입 후
          발급받은 authtoken을 입력하면 서버에 등록됩니다.
          이후 <code className="bg-surface-container-high px-1 rounded text-[11px]">start-ngrok-tunnel.ps1</code>을 실행하면 외부 URL이 자동 생성됩니다.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => { setToken(e.target.value); setStatus('idle') }}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSave() }}
            placeholder="ngrok authtoken 붙여넣기..."
            className="flex-1 h-8 rounded-md border border-outline-variant bg-surface-container-high px-2.5 text-body-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary min-w-0"
          />
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!token.trim() || status === 'saving'}
            className="h-8 shrink-0 rounded-md bg-primary text-on-primary px-3 text-caption font-medium flex items-center gap-1 hover:bg-primary/90 disabled:opacity-50"
          >
            {status === 'saving'
              ? <><Icon name="progress_activity" className="animate-spin text-[13px]" />저장 중</>
              : <><Icon name="save" className="text-[13px]" />저장</>
            }
          </button>
        </div>
        {status === 'ok' && (
          <p className="text-caption text-success flex items-center gap-1">
            <Icon name="check_circle" className="text-[13px]" />토큰이 서버에 등록되었습니다.
          </p>
        )}
        {status === 'error' && errorMsg && (
          <p className="text-caption text-error flex items-center gap-1">
            <Icon name="error" className="text-[13px]" />{errorMsg}
          </p>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 메인 패널
// ══════════════════════════════════════════════════════════════════════════════

export default function InventorySettingsPanel() {
  const [form, setForm] = useState<SurveyFormMeta | null>(null)
  const [datasets, setDatasets] = useState<ServerDatasetMeta[]>([])
  const [erpFiles, setErpFiles] = useState<ErpFileMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showSkipped, setShowSkipped] = useState(false)
  const [msg, setMsg] = useState<{ tone: Tone; text: string } | null>(null)

  const say = (tone: Tone, text: string) => setMsg({ tone, text })

  const reload = async () => {
    const [f, ds, erps] = await Promise.all([fetchSurveyForm(), fetchServerDatasets(), fetchAllErpFiles()])
    setForm(f)
    setDatasets(ds)
    setErpFiles(erps)
  }

  useEffect(() => {
    void reload().finally(() => setLoading(false))
  }, [])

  const handleFormUpload = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    setMsg(null)
    try {
      const res = await uploadSurveyForm(file)
      if (!res.ok) { say('error', `전사 양식 업로드 실패: ${res.error}`); return }
      await reload()
      say('ok', `전사 양식 등록됨 — 시트 ${res.form?.sheetNames.length ?? 0}개`)
    } finally {
      setUploading(false)
    }
  }

  const handleFormDelete = async () => {
    if (!form) return
    if (!window.confirm(`전사 양식을 삭제할까요?\n\n${form.fileName}\n\n이미 등록된 본부 데이터셋은 그대로 남습니다.`)) return
    const res = await deleteSurveyForm(form.id)
    if (!res.ok) { say('error', `삭제 실패: ${res.error}`); return }
    await reload()
    say('ok', '전사 양식을 삭제했습니다.')
  }

  // 데이터셋은 parentDept가 곧 본부 시트 이름입니다.
  const datasetByDept = new Map(datasets.map((d) => [d.parentDept, d]))
  const erpByDept = new Map(erpFiles.map((e) => [e.parentDept, e]))
  const allSheets = form?.sheetNames ?? []
  const divisionSheets = allSheets.filter((n) => !isSkipSheet(n))
  const skippedSheets = allSheets.filter((n) => isSkipSheet(n))
  const visibleSheets = showSkipped ? allSheets : divisionSheets
  const registered = divisionSheets.filter((n) => datasetByDept.has(n)).length

  // 양식 시트에는 없지만 서버에 남아 있는 데이터셋 (양식을 바꿨거나 지운 경우)
  const orphanDatasets = datasets.filter((d) => !allSheets.includes(d.parentDept))

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-body-sm text-on-surface-variant">
        <Icon name="progress_activity" className="animate-spin text-[18px]" />불러오는 중...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {([
          ['본부 시트', String(divisionSheets.length), 'text-on-surface'],
          ['데이터셋 등록', `${registered}/${divisionSheets.length}`,
            divisionSheets.length > 0 && registered === divisionSheets.length ? 'text-success' : 'text-primary'],
          ['운영관리부\n전사 양식', form ? '첨부됨' : '미첨부', form ? 'text-success' : 'text-on-surface-variant'],
        ] as [string, string, string][]).map(([label, val, cls]) => (
          <div key={label} className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
            <p className={`text-h2 font-bold ${cls}`}>{val}</p>
            <p className="text-caption text-on-surface-variant whitespace-pre-line">{label}</p>
          </div>
        ))}
      </div>

      {msg && (
        <p className={`rounded-lg px-3 py-2 text-caption ${
          msg.tone === 'ok' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
        }`}>
          {msg.text}
        </p>
      )}

      {/* ① 운영관리부 전사 자산 현황 */}
      <div className="space-y-2">
        <div className="rounded-lg bg-primary/6 border border-primary/20 px-3 py-2.5 text-caption text-on-surface-variant space-y-0.5">
          <p className="font-semibold text-primary">① 운영관리부 전사 자산 현황 : 엑셀</p>
          <p>전사 본부별 시트로 구성된 양식을 올리면 서버에 보관되고, 시트 목록이 아래 본부 목록이 됩니다.</p>
        </div>

        {form ? (
          <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/5 px-3 py-2.5">
            <Icon name="check_circle" className="text-success text-[18px] shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-medium text-on-surface truncate">{form.fileName}</p>
              <p className="text-caption text-on-surface-variant">
                시트 {form.sheetNames.length}개 (본부 {divisionSheets.length}개) · {(form.size / 1024).toFixed(0)} KB · {form.uploadedAt.slice(0, 10)}
              </p>
            </div>
            <label className="shrink-0 cursor-pointer rounded-lg border border-outline-variant px-2.5 py-1.5 text-[11px] text-on-surface-variant hover:bg-surface-container-high">
              교체
              <input type="file" accept=".xlsx" className="hidden" disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0] ?? null; e.target.value = ''; void handleFormUpload(f) }} />
            </label>
            <button type="button" onClick={() => void handleFormDelete()} title="전사 양식 삭제"
              className="shrink-0 p-1 rounded text-on-surface-variant/50 hover:text-error hover:bg-error/8">
              <Icon name="close" className="text-[16px]" />
            </button>
          </div>
        ) : (
          <DropZone label="운영관리부 전사 자산 현황 (.xlsx)" hint="전사 본부별 시트 포함 파일"
            icon="table_chart" file={null} onChange={(f) => void handleFormUpload(f)} disabled={uploading} />
        )}

        {uploading && (
          <div className="flex items-center gap-2 text-body-sm text-on-surface-variant">
            <Icon name="progress_activity" className="animate-spin text-[16px]" />업로드 · 시트 분석 중...
          </div>
        )}
      </div>

      {/* ② 본부별 ERP 자산 현황 */}
      <div className="space-y-2">
        <div className="rounded-lg bg-primary/6 border border-primary/20 px-3 py-2.5 text-caption text-on-surface-variant space-y-0.5">
          <p className="font-semibold text-primary">② 본부별 ERP 자산 현황 : 엑셀</p>
          <p>본부마다 ERP 자산현황 파일을 올리면 전사 양식과 자산번호로 병합해 데이터셋을 만듭니다. 등록 즉시 앱의 데이터셋 목록과 폰의 소속 선택지에 반영됩니다.</p>
        </div>

        {!form ? (
          <div className="rounded-lg border border-dashed border-outline-variant p-6 text-center">
            <Icon name="table_chart" className="text-[28px] text-on-surface-variant/40 mb-2" />
            <p className="text-body-sm text-on-surface-variant">먼저 ① 전사 양식을 올리면 본부 목록이 나옵니다.</p>
          </div>
        ) : visibleSheets.length === 0 ? (
          <p className="text-center text-caption text-on-surface-variant py-4">양식에서 본부 시트를 찾지 못했습니다.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              {visibleSheets.map((name) => (
                <DivisionRow
                  key={name}
                  sheetName={name}
                  formId={form.id}
                  dataset={datasetByDept.get(name)}
                  storedErp={erpByDept.get(name)}
                  onChanged={reload}
                  onMessage={say}
                />
              ))}
            </div>
            {skippedSheets.length > 0 && (
              <button type="button" onClick={() => setShowSkipped((v) => !v)}
                className="text-caption text-on-surface-variant hover:text-on-surface hover:underline">
                {showSkipped
                  ? `안내성 시트 ${skippedSheets.length}개 숨기기`
                  : `안내성 시트 ${skippedSheets.length}개 보기 (${skippedSheets.slice(0, 3).join(', ')}…)`}
              </button>
            )}
          </>
        )}
      </div>

      {/* 양식에 없는데 서버에 남아 있는 데이터셋 */}
      {orphanDatasets.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-caption text-on-surface-variant">
            현재 양식에 없는 데이터셋 ({orphanDatasets.length}) — 이전 양식으로 등록된 것입니다.
          </p>
          {orphanDatasets.map((d) => (
            <DivisionRow
              key={d.id}
              sheetName={d.parentDept}
              formId={form?.id ?? ''}
              dataset={d}
              storedErp={erpByDept.get(d.parentDept)}
              onChanged={reload}
              onMessage={say}
            />
          ))}
        </div>
      )}

      {/* 새로고침 */}
      <div className="flex items-center justify-end pt-1 border-t border-outline-variant">
        <button type="button" onClick={() => void reload()}
          className="text-caption text-primary hover:underline flex items-center gap-1">
          <Icon name="refresh" className="text-[13px]" />서버 상태 새로고침
        </button>
      </div>

      {/* ngrok 토큰 */}
      <NgrokTokenSection />
    </div>
  )
}
