// 재물조사 앱 — DB 파일 관리 패널 (관리자 전용)
//
// 운영관리부 전사 ERP 한 파일을 올리면 본부별 시트가 자동으로 데이터셋이 되어 앱에 반영됩니다.
//
// 화면 상태의 출처는 전부 서버입니다. 예전에는 전사 양식이 React state와 서버 메모리
// 캐시(2시간)에만 있어서 새로고침하거나 서버가 재시작하면 "미첨부"로 돌아갔습니다.

import { useEffect, useRef, useState } from 'react'
import { verifyAdminAccessCode } from '../../auth/adminAccess'
import { Icon } from '../../components/Icon'
import PublishedSubmissionDownload from './PublishedSubmissionDownload'
import {
  fetchMasterFiles,
  AdminAuthRequiredError,
  fetchCoverageStats,
  openSseStream,
  previewMasterDeletion,
  deleteMasterFile,
  type MasterFileInfo,
  deleteServerDataset,
  fetchServerDatasets,
  fetchSurveyForm,
  getInventoryApiOrigin,
  resetInventoryApiOrigin,
  setInventoryApiOrigin,
  saveNgrokToken,
  uploadSurveyForm,
  type ServerDatasetMeta,
  type SurveyFormMeta,
} from './inventoryApiClient'

// ── 시트 제외 패턴 ────────────────────────────────────────────────────────────
// 본부가 아닌 안내성 시트는 기본으로 감춥니다.
import { isDepartmentSheet, forgetDataset } from './datasetService'
import { forgetDeletedDatasetSessions } from './syncService'

function isSkipSheet(name: string): boolean {
  return !isDepartmentSheet(name)
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

function MdmCertificateSection() {
  const serverHost = window.location.hostname || 'localhost'
  const baseUrl = `http://${serverHost}:3001`
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
      <div className="flex items-center gap-2 border-b border-outline-variant bg-surface-container-low px-3 py-2.5">
        <Icon name="admin_panel_settings" className="text-[16px] text-primary" />
        <span className="flex-1 text-body-sm font-semibold text-on-surface">기관 단말 MDM 인증서 배포</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">관리자용</span>
      </div>
      <div className="space-y-3 px-3 py-3">
        <p className="text-caption leading-relaxed text-on-surface-variant">
          MDM 콘솔에 운영체제별 파일을 등록한 뒤 <b>필수 설치</b> 정책으로 배포하세요. 단말 사용자가 직접 CA 인증서를 설치할 필요가 없습니다.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <a href={`${baseUrl}/rootCA.cer`} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-outline-variant bg-white px-3 text-caption font-medium text-primary"><Icon name="android" className="text-[15px]" />Android DER</a>
          <a href={`${baseUrl}/rootCA.mobileconfig`} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-outline-variant bg-white px-3 text-caption font-medium text-primary"><Icon name="phone_iphone" className="text-[15px]" />iOS 프로파일</a>
          <a href={`${baseUrl}/mdm-ca-manifest.json`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-outline-variant bg-white px-3 text-caption font-medium text-primary"><Icon name="fingerprint" className="text-[15px]" />인증서 지문</a>
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-caption text-on-surface-variant">
          <li>Android는 신뢰할 수 있는 CA 인증서 정책에 DER 파일을 등록합니다.</li>
          <li>iOS/iPadOS는 구성 프로파일을 업로드하고 감독 대상 기기에 할당합니다.</li>
          <li>설치 상태를 필수 규정 준수 항목으로 설정한 뒤 단말에 동기화합니다.</li>
        </ol>
      </div>
    </div>
  )
}

function CloudflareTunnelSection() {
  const [apiUrl, setApiUrl] = useState(getInventoryApiOrigin())
  const [draftUrl, setDraftUrl] = useState(apiUrl)
  const [state, setState] = useState<'checking' | 'online' | 'offline'>('checking')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setState('checking')
    fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(5000) })
      .then((response) => setState(response.ok ? 'online' : 'offline'))
      .catch(() => setState('offline'))
  }, [apiUrl])

  const saveAndTest = async () => {
    setMessage('')
    setState('checking')
    try {
      const normalized = draftUrl.trim().replace(/\/api\/inventory\/?$/i, '').replace(/\/$/, '')
      const response = await fetch(`${normalized}/health`, { signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error(`서버 응답 오류 (${response.status})`)
      const saved = setInventoryApiOrigin(normalized)
      setApiUrl(saved)
      setDraftUrl(saved)
      setState('online')
      setMessage('연결 확인 및 저장 완료 — 이 브라우저와 새 QR에 적용됩니다.')
    } catch (error) {
      setState('offline')
      setMessage(`저장하지 못했습니다: ${(error as Error).message}`)
    }
  }

  const restoreDefault = () => {
    const restored = resetInventoryApiOrigin()
    setApiUrl(restored)
    setDraftUrl(restored)
    setMessage('기본 서버 주소로 복원했습니다.')
  }

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
      <div className="flex items-center gap-2 border-b border-outline-variant bg-surface-container-low px-3 py-2.5">
        <Icon name="cloud_sync" className="text-[16px] text-primary" />
        <span className="flex-1 text-body-sm font-semibold text-on-surface">외부 재물조사 서버</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${state === 'online' ? 'bg-success/10 text-success' : state === 'checking' ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'}`}>
          {state === 'online' ? '연결됨' : state === 'checking' ? '확인 중' : '연결 안 됨'}
        </span>
      </div>
      <div className="space-y-2 px-3 py-3 text-caption text-on-surface-variant">
        <p>Vercel 앱이 Cloudflare Tunnel을 통해 기관 PC의 Express·SQLite·파일 저장소에 연결됩니다. 휴대폰 CA 인증서와 동일 Wi-Fi가 필요하지 않습니다.</p>
        <label className="block">
          <span className="font-medium text-on-surface">외부 API 주소</span>
          <div className="mt-1 flex flex-col gap-1.5 sm:flex-row">
            <input
              type="url"
              value={draftUrl}
              onChange={(event) => setDraftUrl(event.target.value)}
              placeholder="https://새주소.trycloudflare.com"
              className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 font-mono text-[11px] outline-none focus:border-primary"
            />
            <button type="button" onClick={() => void saveAndTest()}
              className="rounded-lg bg-primary px-3 py-2 font-medium text-on-primary hover:bg-primary/90">
              연결 테스트 후 저장
            </button>
            <button type="button" onClick={restoreDefault}
              className="rounded-lg border border-outline-variant px-3 py-2 text-on-surface-variant hover:bg-surface-container-high">
              기본값
            </button>
          </div>
        </label>
        {message && (
          <p className={state === 'offline' ? 'text-error' : 'text-success'}>{message}</p>
        )}
        <div className="rounded-lg bg-surface-container px-3 py-2 text-[11px] leading-relaxed">
          재부팅 후 주소가 바뀌면 기관 PC의 <code className="font-mono">.runtime/current-tunnel-url.txt</code>에 적힌 주소를 위에 붙여 넣으세요.
        </div>
        {state === 'offline' && (
          <p className="text-error">자동 실행 작업이 복구 중입니다. PC 인터넷 연결과 절전 상태를 확인해 주세요.</p>
        )}
        {state === 'online' && (
          <p className="flex items-center gap-1 text-success">
            <Icon name="autorenew" className="text-[13px]" />Windows 로그인 시 서버·터널 자동 실행 및 30초 간격 복구
          </p>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 메인 패널
// ══════════════════════════════════════════════════════════════════════════════

export default function InventorySettingsPanel({ showExport = true }: { showExport?: boolean } = {}) {
  const [form, setForm] = useState<SurveyFormMeta | null>(null)
  const [masterFiles, setMasterFiles] = useState<MasterFileInfo[]>([])
  const [datasets, setDatasets] = useState<ServerDatasetMeta[]>([])
  const [confirmedCounts, setConfirmedCounts] = useState<Record<string, number>>({})
  const reloadSequence = useRef(0)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [msg, setMsg] = useState<{ tone: Tone; text: string } | null>(null)

  const say = (tone: Tone, text: string) => setMsg({ tone, text })

  const reload = async () => {
    const sequence = ++reloadSequence.current
    // Each section loads on its own: one refused request (e.g. admin-only asset files)
    // must not blank the whole settings page.
    const [f, ds, files, coverage] = await Promise.allSettled([fetchSurveyForm(), fetchServerDatasets(), fetchMasterFiles(), fetchCoverageStats()])
    if (sequence !== reloadSequence.current) return
    if (coverage.status === 'fulfilled') setConfirmedCounts(Object.fromEntries(coverage.value.map(row => [row.datasetId, row.confirmed])))
    if (f.status === 'fulfilled') setForm(f.value)
    if (files.status === 'fulfilled') { setMasterFiles(files.value); setAdminAuthNeeded(false) }
    else if (files.reason instanceof AdminAuthRequiredError) setAdminAuthNeeded(true)
    if (ds.status === 'fulfilled') {
      const list = ds.value
      setDatasets(list)
      setSelected(previous => previous.filter(id => list.some(dataset => dataset.id === id && dataset.sessionCount === 0)))
    }
    const failed = [f, ds, files, coverage].find(result => result.status === 'rejected' && !(result.reason instanceof AdminAuthRequiredError))
    if (failed?.status === 'rejected') throw failed.reason
  }

  // Restores admin API access in place (the admin code is kept until logout).
  const [adminAuthNeeded, setAdminAuthNeeded] = useState(false)
  const [adminCode, setAdminCode] = useState('')
  const [adminVerifying, setAdminVerifying] = useState(false)
  const submitAdminCode = async () => {
    if (!adminCode.trim() || adminVerifying) return
    setAdminVerifying(true)
    try {
      if (!(await verifyAdminAccessCode(adminCode))) { say('error', '관리자 인증 코드가 올바르지 않습니다.'); return }
      setAdminCode('')
      await reload()
      say('ok', '관리자 인증을 확인했습니다.')
    } catch (error) {
      say('error', (error as Error).message)
    } finally {
      setAdminVerifying(false)
    }
  }

  useEffect(() => {
    void reload().catch(error => say('error', (error as Error).message)).finally(() => setLoading(false))
    const refresh = () => { void reload().catch(() => {}) }
    const stop = openSseStream('*', type => {
      if (type === 'submission_updated' || type === 'connected') refresh()
    })
    const timer = window.setInterval(() => { if (!document.hidden) refresh() }, 15000)
    window.addEventListener('focus', refresh)
    return () => { reloadSequence.current++; stop(); clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])

  const masterConfirmed = (id: string) => {
    const linked = datasets.filter(dataset => dataset.source?.startsWith(`survey-form:${id}|`))
    if (linked.some(dataset => confirmedCounts[dataset.id] === undefined)) return '조회 필요'
    return `${linked.reduce((sum, dataset) => sum + confirmedCounts[dataset.id], 0).toLocaleString()}건`
  }

  const handleFormUpload = async (file: File | null) => {
    if (!file) return
    if (form && !window.confirm(`새 마스터 버전으로 등록합니다.\n\n기존 마스터와 진행 중인 조사는 그대로 보존됩니다. 새로 시작하는 조사는 새 마스터를 사용하며, 두 버전의 제출 파일은 분리됩니다.\n\n새 파일: ${file.name}\n계속하시겠습니까?`)) return
    setUploading(true)
    setMsg(null)
    try {
      const res = await uploadSurveyForm(file)
      if (!res.ok) { say('error', `전사 양식 업로드 실패: ${res.error}`); return }
      await reload()
      window.dispatchEvent(new Event('inventory-datasets-updated'))
      say(
        'ok',
        `전사 ERP 등록 완료 — 본부 데이터셋 ${res.datasetsCreated ?? 0}개 · 자산 ${(res.assetCount ?? 0).toLocaleString()}건`,
      )
    } finally {
      setUploading(false)
    }
  }

  const deleteDatabases = async (ids: string[]) => {
    if (deleting || uploading) return
    const targets = datasets.filter(dataset => ids.includes(dataset.id) && dataset.sessionCount === 0)
    if (!targets.length) return
    const count = targets.reduce((sum, dataset) => sum + dataset.assetCount, 0)
    const names = targets.slice(0, 8).map(dataset => `• ${dataset.title} (${dataset.assetCount.toLocaleString()}건)`).join('\n')
    if (!window.confirm(`선택한 자산 DB ${targets.length}개, 총 ${count.toLocaleString()}건을 삭제할까요?\n\n${names}${targets.length > 8 ? '\n…' : ''}\n\n서버의 선택한 자산 DB가 삭제됩니다. 운영관리부 마스터 원본은 유지됩니다. 복구하려면 원본으로 다시 등록해야 합니다.`)) return
    setDeleting(true)
    setMsg(null)
    let removed = 0
    const failed: string[] = []
    try {
      for (const dataset of targets) {
        const result = await deleteServerDataset(dataset.id)
        if (result.ok) {
          removed++
          await forgetDataset(dataset.id).catch(() => {})
        } else failed.push(`${dataset.title}: ${result.error || '삭제 실패'}`)
      }
      await reload()
      window.dispatchEvent(new Event('inventory-datasets-updated'))
      say(failed.length ? 'error' : 'ok', `자산 DB ${removed}개 삭제 완료${failed.length ? ` · 실패 ${failed.length}개 — ${failed.join(' / ')}` : ''}`)
    } catch (error) { say('error', `${removed}개 삭제 후 목록 갱신 실패: ${(error as Error).message}`) }
    finally { setDeleting(false) }
  }

  const removeAssetFile = async (id: string) => {
    if (deleting || uploading) return
    setDeleting(true)
    try {
      const target = await previewMasterDeletion(id)
      const answer = window.prompt(`자산파일을 완전히 삭제합니다.\n\n${target.fileName}\n\n연결 DB ${target.datasetCount}개 · 자산 ${target.assetCount.toLocaleString()}건\n조사 ${target.sessionCount}개 · 조사 결과 ${target.resultCount}건\n사진 ${target.photoCount}개 · 결과 파일 ${target.fileCount}개\n\n위 항목이 함께 삭제되며 복구할 수 없습니다.\n진행하려면 ‘삭제’를 입력하세요.`)
      if (answer?.trim() !== '삭제') return
      const removed = await deleteMasterFile(id, target.token)
      await Promise.all(removed.datasetIds.map(id => forgetDataset(id).catch(() => {})))
      await forgetDeletedDatasetSessions(removed.datasetIds)
      await reload()
      window.dispatchEvent(new Event('inventory-datasets-updated'))
      say(removed.cleanupPending ? 'error' : 'ok', removed.cleanupPending ? '등록과 연결 데이터는 삭제됐지만 일부 파일 정리가 남았습니다. 관리자에게 저장소 확인을 요청해 주세요.' : '자산파일과 연결 데이터를 삭제했습니다. ‘자산파일 추가’로 새 엑셀을 등록할 수 있습니다.')
    } catch (error) { say('error', (error as Error).message) }
    finally { setDeleting(false) }
  }

  const allSheets = form?.sheetNames ?? []
  const divisionSheets = allSheets.filter((n) => !isSkipSheet(n))
  const currentDatasets = form ? datasets.filter(dataset => dataset.source?.startsWith(`survey-form:${form.id}|`)) : []
  const assetCount = currentDatasets.reduce((sum, dataset) => sum + dataset.assetCount, 0)
  const otherDatasetCount = datasets.length - currentDatasets.length
  const otherAssetCount = datasets.reduce((sum, dataset) => sum + dataset.assetCount, 0) - assetCount

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
      {showExport && <PublishedSubmissionDownload showPreview />}
      <div className="grid grid-cols-3 gap-2 text-center">
        {([
          ['본부 시트', String(divisionSheets.length), 'text-on-surface'],
          ['현재 ERP 데이터셋', `${currentDatasets.length}개`, currentDatasets.length > 0 ? 'text-success' : 'text-primary'],
          ['현재 ERP 자산', `${assetCount.toLocaleString()}건`, assetCount > 0 ? 'text-success' : 'text-on-surface-variant'],
        ] as [string, string, string][]).map(([label, val, cls]) => (
          <div key={label} className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
            <p className={`text-h2 font-bold ${cls}`}>{val}</p>
            <p className="text-caption text-on-surface-variant whitespace-pre-line">{label}</p>
          </div>
        ))}
      </div>

      {otherDatasetCount > 0 && <p className="text-caption text-on-surface-variant">이전 버전·별도 DB {otherDatasetCount}개 · {otherAssetCount.toLocaleString()}건은 위 집계에서 제외됩니다. 기존 조사 기록을 위해 보관 중입니다.</p>}
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-caption ${
          msg.tone === 'ok' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
        }`}>
          {msg.text}
        </p>
      )}

      {/* ① 운영관리부 전사 자산 현황 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-body-sm">자산파일 관리 ({adminAuthNeeded ? '관리자 인증 필요' : `${masterFiles.length}개`})</p>
          <label className={`rounded-lg bg-blue-600 text-white px-3 py-2 text-caption ${uploading || deleting ? 'opacity-50' : 'cursor-pointer hover:bg-blue-700'}`}>
            + 자산파일 추가
            <input type="file" aria-label="자산파일 추가" accept=".xlsx" className="hidden" disabled={uploading || deleting} onChange={e => { const file = e.target.files?.[0] || null; e.target.value = ''; void handleFormUpload(file) }} />
          </label>
        </div>
        {adminAuthNeeded && (
          <div role="alert" className="mt-2 space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-caption">
            <p>자산파일 목록은 관리자 전용입니다. 이 브라우저에 관리자 인증이 없어 서버가 목록을 보여주지 않았습니다. 관리자 인증 코드를 입력하면 바로 표시됩니다.</p>
            <div className="flex gap-2">
              <input type="password" value={adminCode} onChange={(event) => setAdminCode(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void submitAdminCode() }}
                placeholder="관리자 인증 코드" autoComplete="off" aria-label="관리자 인증 코드"
                className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm" />
              <button type="button" onClick={() => void submitAdminCode()} disabled={!adminCode.trim() || adminVerifying}
                className="shrink-0 rounded-lg bg-primary px-3 py-2 text-body-sm font-semibold text-on-primary disabled:opacity-50">
                {adminVerifying ? '확인 중…' : '인증'}
              </button>
            </div>
          </div>
        )}
        <div className="rounded-lg bg-primary/6 border border-primary/20 px-3 py-2.5 text-caption text-on-surface-variant space-y-0.5">
          <p className="font-semibold text-primary">운영관리부 전사 ERP : 엑셀</p>
          <p>전사 파일 하나를 올리면 본부별 시트를 분석해 데이터셋과 휴대폰 조사 목록을 자동으로 생성합니다.</p>
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
        <div className="space-y-1">
          {masterFiles.map(file => <div key={file.id} className="flex items-center gap-2 rounded border border-outline-variant px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-medium break-all">{file.fileName} <span className="text-caption text-primary">{file.id === form?.id ? '현재 적용' : file.retired ? '등록 해제' : '이전 버전'}</span></p>
              <p className="text-caption text-on-surface-variant">{file.uploadedAt?.slice(0, 16)} · {file.id.slice(0, 8)} · DB {file.datasetCount}개 · 자산 {file.assetCount.toLocaleString()}건 · 확인 자산 {masterConfirmed(file.id)} · 조사 작업 {file.sessionCount}개</p>
            </div>
            <button type="button" aria-label={`${file.fileName} 삭제`} disabled={deleting || uploading} onClick={() => void removeAssetFile(file.id)} className="shrink-0 rounded bg-red-600 text-white px-3 py-2 text-caption disabled:opacity-40 hover:bg-red-700">삭제</button>
          </div>)}
        </div>
      </div>

      {/* 새로고침 */}
      <div className="rounded-lg border border-outline-variant overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-container-low px-3 py-2">
          <p className="text-body-sm font-semibold">등록된 자산 DB ({datasets.length}개)</p>
          <div className="flex gap-2">
            <button type="button" disabled={deleting || uploading} onClick={() => setSelected(datasets.filter(dataset => dataset.sessionCount === 0 && !dataset.source?.startsWith(`survey-form:${form?.id}|`)).map(dataset => dataset.id))} className="text-caption rounded border border-outline-variant px-2 py-1 disabled:opacity-50">미사용 이전 DB 선택</button>
            <button type="button" disabled={!selected.length || deleting || uploading} onClick={() => void deleteDatabases(selected)} className="rounded bg-red-600 text-white px-2 py-1 text-caption disabled:opacity-40">{deleting ? '삭제 중…' : `선택 삭제 (${selected.length})`}</button>
          </div>
        </div>
        <p className="px-3 py-2 text-caption text-on-surface-variant">확인 자산은 서버에 저장된 중복 제외 자산 수이며, 조사 작업은 생성한 조사 목록 수입니다. 조사 작업에 연결된 DB는 삭제가 제한됩니다.</p>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-caption">
            <thead className="sticky top-0 bg-surface-container-low"><tr><th className="px-3 py-2"><input type="checkbox" aria-label="삭제 가능한 DB 전체 선택" disabled={deleting || uploading} checked={datasets.some(d => d.sessionCount === 0) && datasets.filter(d => d.sessionCount === 0).every(d => selected.includes(d.id))} onChange={event => setSelected(event.target.checked ? datasets.filter(d => d.sessionCount === 0).map(d => d.id) : [])} /></th><th className="py-2">본부 / DB</th><th>버전</th><th>자산</th><th>확인 자산</th><th>조사 작업</th><th>등록일</th><th className="pr-3 text-right">관리</th></tr></thead>
            <tbody>{datasets.map(dataset => <tr key={dataset.id} className="border-t border-outline-variant">
              <td className="px-3 py-2"><input type="checkbox" aria-label={`${dataset.title} DB 선택`} checked={selected.includes(dataset.id)} disabled={dataset.sessionCount !== 0 || deleting || uploading} onChange={event => setSelected(previous => event.target.checked ? [...previous, dataset.id] : previous.filter(id => id !== dataset.id))} /></td>
              <td className="py-2"><span className="font-medium">{dataset.title}</span><span className="block text-on-surface-variant">{dataset.parentDept} · {dataset.id.slice(0, 8)}</span></td>
              <td>{dataset.source?.startsWith(`survey-form:${form?.id}|`) ? '현재' : '이전 / 별도'}</td>
              <td>{dataset.assetCount.toLocaleString()}건</td><td className="font-semibold text-success">{confirmedCounts[dataset.id] === undefined ? '조회 필요' : `${confirmedCounts[dataset.id].toLocaleString()}건`}</td><td>{dataset.sessionCount === undefined ? '조회 필요' : `${dataset.sessionCount}개`}</td>
              <td>{dataset.uploadedAt.slice(0, 16).replace('T', ' ')}</td>
              <td className="pr-3 text-right"><button type="button" disabled={dataset.sessionCount !== 0 || deleting || uploading} onClick={() => void deleteDatabases([dataset.id])} className="rounded bg-red-50 text-red-700 border border-red-200 px-2 py-1 disabled:opacity-40">{dataset.sessionCount ? '조사 연결됨' : '삭제'}</button></td>
            </tr>)}</tbody>
          </table>
          {!datasets.length && <p className="p-3 text-caption text-on-surface-variant">등록된 자산 DB가 없습니다.</p>}
        </div>
      </div>
      <div className="flex items-center justify-end pt-1 border-t border-outline-variant">
        <button type="button" onClick={() => void reload()}
          className="text-caption text-primary hover:underline flex items-center gap-1">
          <Icon name="refresh" className="text-[13px]" />서버 상태 새로고침
        </button>
      </div>

      {/* ngrok 토큰 */}
      <CloudflareTunnelSection />
      {false && <NgrokTokenSection />}
      {false && <MdmCertificateSection />}
    </div>
  )
}
