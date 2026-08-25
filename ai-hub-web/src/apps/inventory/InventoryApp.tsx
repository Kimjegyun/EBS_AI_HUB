import { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react'
import { Icon } from '../../components/Icon'
import { useAuthSafe } from '../../auth/AuthContext'
import type { AppContext } from '../types'
import {
  SURVEY_STATUSES,
  type Asset,
  type ErpAsset,
  type SurveyResult,
  type SurveySession,
  type SurveyStatus,
} from './types'
import { ensureDataset, getAllDatasetSources, getLoadedDataset, lookupAsset, normalizeAssetNo } from './datasetService'
import {
  clearErpFile,
  importErpFile,
  loadErpIndex,
  lookupErp,
  syncErpFromServer,
  type ErpStore,
} from './erpLookup'
import {
  createSession,
  deleteSession,
  getSessions,
  markCompleted,
  pullServerSessions,
  removeResult,
  sessionStats,
  startSyncLoop,
  stopSyncLoop,
  subscribeSessions,
  uploadSession,
  upsertResult,
} from './syncService'
import {
  buildMergedSurveyWorkbook,
  downloadDivisionResult,
  downloadMergedSurveyFile,
  downloadSessionExcel,
} from './excelService'
import { aiAvailable, aiVerifyAsset } from './aiVerify'
import { deletePhotos, getPhotos, savePhoto, type StoredPhoto } from './photoService'
import {
  confirmPairCode,
  downloadDatasetExcel,
  downloadInventoryFile,
  fetchCoverageStats,
  fetchInventoryFiles,
  fetchPairedDevices,
  fetchServerDatasets,
  fetchStats,
  fetchUnsurveyedAssets,
  openSseStream,
  saveBlobAs,
  submitSurveyResults,
  uploadInventoryFile,
  uploadSurveyResultFile,
  type DatasetCoverage,
  type DeptCoverage,
  type DevicePair,
  type InventoryFileMeta,
  type SessionStat,
  type UnsurveyedAsset,
} from './inventoryApiClient'
import { inventoryInstallUrl, isExternalInstallUrl } from './installUrl'
import QrScanner from './QrScanner'
import InventorySettingsPanel from './InventorySettingsPanel'

const STATUS_TONE: Record<SurveyStatus, string> = {
  정상: 'bg-success/15 text-success',
  부서이동: 'bg-warning/15 text-warning',
  위치이동: 'bg-warning/15 text-warning',
  사용자변경: 'bg-warning/15 text-warning',
  소재불명: 'bg-error/15 text-error',
  불용대상: 'bg-error/15 text-error',
  반납대상: 'bg-error/15 text-error',
}

interface Draft {
  assetNo: string
  name: string
  location: string
  dept: string
  model: string
  spec: string
  status: SurveyStatus
  stickerMissing: boolean
  note: string
  verifier: string
  verifierDept: string
  matched: boolean
  photoIds: string[]
}

function draftFromAsset(asset: Asset, verifier: string, verifierDept: string, prev?: SurveyResult): Draft {
  return {
    assetNo: asset.assetNo,
    name: prev?.name ?? asset.name,
    location: prev?.location ?? asset.location,
    dept: prev?.dept ?? asset.dept,
    model: asset.model,
    spec: asset.spec,
    status: prev?.status ?? '정상',
    stickerMissing: prev?.stickerMissing ?? false,
    note: prev?.note ?? '',
    verifier: prev?.verifier ?? verifier,
    verifierDept: prev?.verifierDept ?? verifierDept,
    matched: true,
    photoIds: prev?.photoIds ?? [],
  }
}

/**
 * 마스터에 없는 자산 — 사용자가 올린 ERP 자산현황 파일에서 찾은 정보로 초안을 채웁니다.
 * matched는 false 그대로 둡니다(마스터 조회 여부가 기준이므로).
 */
function draftFromErp(
  erp: ErpAsset, assetNo: string, verifier: string, verifierDept: string, prev?: SurveyResult,
): Draft {
  return {
    assetNo,
    name: prev?.name ?? erp.name ?? '',
    location: prev?.location ?? erp.location ?? '',
    dept: prev?.dept ?? erp.dept ?? '',
    model: prev?.model ?? erp.model ?? '',
    spec: prev?.spec ?? erp.spec ?? '',
    status: prev?.status ?? '소재불명',
    stickerMissing: prev?.stickerMissing ?? false,
    note: prev?.note ?? '',
    verifier: prev?.verifier ?? verifier,
    verifierDept: prev?.verifierDept ?? verifierDept,
    matched: false,
    photoIds: prev?.photoIds ?? [],
  }
}

function emptyDraft(assetNo: string, verifier: string, verifierDept: string, prev?: SurveyResult): Draft {
  return {
    assetNo,
    name: prev?.name ?? '',
    location: prev?.location ?? '',
    dept: prev?.dept ?? '',
    model: prev?.model ?? '',
    spec: prev?.spec ?? '',
    status: prev?.status ?? '소재불명',
    stickerMissing: prev?.stickerMissing ?? false,
    note: prev?.note ?? '',
    verifier: prev?.verifier ?? verifier,
    verifierDept: prev?.verifierDept ?? verifierDept,
    matched: false,
    photoIds: prev?.photoIds ?? [],
  }
}

type Tab = 'sessions' | 'stats' | 'datasets' | 'pairing' | 'settings'

interface InventoryAppProps extends Partial<AppContext> {
  /** standalone 모드: 외부에서 사용자 정보 주입 (인증 없이 사용 시) */
  overrideUserName?: string
  overrideUserDept?: string
  overrideIsAdmin?: boolean
}

export default function InventoryApp({ overrideUserName, overrideUserDept, overrideIsAdmin }: InventoryAppProps) {
  // useAuthSafe: AuthProvider 없는 standalone(PWA) 환경에서도 안전하게 null 반환
  const authCtx = useAuthSafe()
  const authSession = authCtx?.session ?? null
  const userName = overrideUserName ?? authSession?.displayName ?? '사용자'
  const userDept = overrideUserDept ?? authSession?.organization ?? ''
  const isAdmin = overrideIsAdmin ?? authSession?.role === 'admin'
  const [sessions, setSessions] = useState<SurveySession[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('sessions')
  const sseCleanupRef = useRef<(() => void) | null>(null)

  // Boot: pull server sessions + start offline sync loop
  useEffect(() => {
    void pullServerSessions()
    startSyncLoop()
    return () => stopSyncLoop()
  }, [])

  useEffect(() => {
    getSessions().then(setSessions)
    return subscribeSessions(() => getSessions().then(setSessions))
  }, [])

  // SSE: subscribe to active session changes from other devices
  const subscribeToSession = useCallback((sessionId: string) => {
    sseCleanupRef.current?.()
    sseCleanupRef.current = openSseStream(sessionId, (type) => {
      if (type === 'result_updated' || type === 'result_deleted' || type === 'session_completed') {
        // Refresh local store from server
        import('./inventoryApiClient').then(({ fetchServerSession }) =>
          fetchServerSession(sessionId).then(async (full) => {
            if (full) {
              const { idbPut } = await import('./idb')
              const { STORE_SESSIONS } = await import('./idb')
              await idbPut(STORE_SESSIONS, full)
              getSessions().then(setSessions)
            }
          })
        )
      }
    })
  }, [])

  const openSession = (id: string) => {
    setActiveId(id)
    subscribeToSession(id)
  }

  const handleBack = () => {
    sseCleanupRef.current?.()
    sseCleanupRef.current = null
    setActiveId(null)
  }

  const active = useMemo(() => sessions.find((s) => s.id === activeId) ?? null, [sessions, activeId])

  if (active) {
    return (
      <SurveyRunner
        session={active}
        userName={userName}
        userDept={userDept}
        isAdmin={isAdmin}
        onBack={handleBack}
      />
    )
  }

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-outline-variant">
        {([['sessions', '조사 목록'], ['datasets', '데이터셋'], ['stats', '통계']] as [Tab, string][]).concat(
          isAdmin ? [['pairing', '기기 관리'], ['settings', '설정']] : []
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`no-drag px-3 py-2 text-body-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'sessions' && (
        <SessionList
          sessions={sessions}
          userName={userName}
          organization={authSession?.organization ?? ''}
          onOpen={openSession}
        />
      )}
      {tab === 'datasets' && (
        <DatasetManager isAdmin={isAdmin} />
      )}
      {tab === 'stats' && (
        <StatsView isAdmin={isAdmin} />
      )}
      {tab === 'pairing' && isAdmin && (
        <PairingManager />
      )}
      {tab === 'settings' && isAdmin && (
        <InventorySettingsPanel />
      )}
    </div>
  )
}

/* ------------------------------- Session list ------------------------------ */

/** 완성된 재물조사 엑셀을 서버에 업로드 → 세션 결과로 저장 */
function ExcelUploadButton({
  session,
  onDone,
}: {
  session: SurveySession
  onDone: (msg: string) => void
}) {
  const fileId = useId()
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file: File) => {
    setUploading(true)
    const res = await uploadSurveyResultFile({
      datasetId: session.datasetId,
      file,
      sessionName: session.name,
      dept: session.dept,
      sessionId: session.id,
    })
    setUploading(false)
    if (res.ok) {
      onDone(`✅ 엑셀 업로드 완료: ${res.updated}건 등록`)
    } else {
      onDone(`❌ 업로드 실패: ${res.error}`)
    }
  }

  return (
    <label
      htmlFor={fileId}
      title="완성된 재물조사 엑셀 업로드"
      className={`no-drag w-8 h-8 flex items-center justify-center rounded-full cursor-pointer transition-colors ${
        uploading
          ? 'text-primary opacity-60 pointer-events-none'
          : 'text-success hover:bg-success/10'
      }`}
      aria-label="완성 엑셀 업로드"
    >
      <Icon
        name={uploading ? 'progress_activity' : 'upload_file'}
        className={`text-[18px] ${uploading ? 'animate-spin' : ''}`}
      />
      <input
        id={fileId}
        type="file"
        accept=".xlsx"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
          e.target.value = ''
        }}
      />
    </label>
  )
}

/**
 * 조사목록 탭 상단 — 본부별 진행 현황과 미확인 자산 상세.
 * 조사 "건수"가 아니라 데이터셋 전체 자산 기준이라 100% 여부가 바로 보입니다.
 */
function SurveyProgressPanel() {
  const [coverage, setCoverage] = useState<DatasetCoverage[]>([])
  const [busy, setBusy] = useState(true)
  const [openDataset, setOpenDataset] = useState<string | null>(null)

  const load = async () => {
    setBusy(true)
    try {
      setCoverage(await fetchCoverageStats())
    } finally {
      setBusy(false)
    }
  }

  // setState는 모두 await 이후에 일어나지만 규칙이 호출을 따라 들어가 오탐합니다.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [])

  if (busy && coverage.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2.5 text-caption text-on-surface-variant">
        <Icon name="progress_activity" className="animate-spin text-[15px]" />진행 현황 불러오는 중...
      </div>
    )
  }
  if (coverage.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon name="donut_large" className="text-primary text-[18px]" />
        <h3 className="flex-1 text-body-sm font-semibold text-on-surface">본부별 조사 진행 현황</h3>
        <button type="button" onClick={() => void load()} disabled={busy}
          className="no-drag inline-flex items-center gap-1 text-caption text-on-surface-variant hover:text-primary disabled:opacity-50">
          <Icon name={busy ? 'progress_activity' : 'refresh'} className={`text-[14px] ${busy ? 'animate-spin' : ''}`} />갱신
        </button>
      </div>

      {coverage.map((d) => {
        const open = openDataset === d.datasetId
        const done = d.unsurveyed === 0 && d.totalAssets > 0
        return (
          <div key={d.datasetId} className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low">
            <div className="space-y-1.5 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-on-surface">{d.parentDept}</span>
                {done ? (
                  <span className="shrink-0 rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">100% 완료</span>
                ) : (
                  <span className="shrink-0 rounded bg-error/12 px-1.5 py-0.5 text-[10px] font-semibold text-error">
                    미확인 {d.unsurveyed.toLocaleString()}
                  </span>
                )}
              </div>
              <p className="text-caption text-on-surface-variant">
                전체 {d.totalAssets.toLocaleString()}건 · 확인 {d.confirmed.toLocaleString()} · 부서 {d.depts.length}개
                {d.abnormal > 0 && <> · 이상 {d.abnormal.toLocaleString()}</>}
              </p>
              <ProgressBar done={d.surveyed} total={d.totalAssets} />
              {d.unsurveyed > 0 && (
                <button type="button" onClick={() => setOpenDataset(open ? null : d.datasetId)}
                  className="no-drag inline-flex items-center gap-1 text-caption text-primary hover:underline">
                  <Icon name={open ? 'expand_less' : 'expand_more'} className="text-[15px]" />
                  미확인 자산 {open ? '접기' : '상세 보기'}
                </button>
              )}
            </div>
            {open && (
              <div className="border-t border-outline-variant/60 bg-surface-container-low/40 px-3 py-2.5">
                <UnsurveyedAssetList datasetId={d.datasetId} expectedTotal={d.unsurveyed} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SessionList({
  sessions,
  userName,
  organization,
  onOpen,
}: {
  sessions: SurveySession[]
  userName: string
  organization: string
  onOpen: (id: string) => void
}) {
  const [showForm, setShowForm] = useState(sessions.length === 0)
  const defaultName = `${new Date().getFullYear()}년 정기재물조사`
  const [name, setName] = useState(defaultName)
  const [datasetSources, setDatasetSources] = useState([] as { id: string; title: string; parentDept: string }[])
  const [datasetId, setDatasetId] = useState('')
  const [dept, setDept] = useState(organization)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [dlToast, setDlToast] = useState<string | null>(null)

  const flashDl = (msg: string) => { setDlToast(msg); setTimeout(() => setDlToast(null), 3000) }

  const handleDownloadExcel = async (datasetId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDownloadingId(datasetId)
    const res = await downloadDatasetExcel(datasetId)
    setDownloadingId(null)
    if (res.ok) {
      flashDl('✅ 본부별 현재자산 엑셀을 다운로드했습니다.')
    } else {
      flashDl(`다운로드 실패: ${res.error}`)
    }
  }

  // Load dataset list (local + server)
  useEffect(() => {
    getAllDatasetSources().then((sources) => {
      setDatasetSources(sources)
      if (sources.length > 0 && !datasetId) setDatasetId(sources[0].id)
    })
  }, [])

  const create = async () => {
    if (!name.trim() || !datasetId) return
    setError(null)
    setBusy('자산 데이터 준비 중...')
    try {
      const src = datasetSources.find((d) => d.id === datasetId)
      await ensureDataset(datasetId, (phase) => {
        setBusy(phase === 'download' ? '자산 마스터 다운로드 중...' : '자산 데이터 준비 중...')
      })
      const s = await createSession({
        name,
        datasetId,
        parentDept: src?.parentDept ?? '',
        createdBy: userName,
        dept,
      })
      setBusy(null)
      onOpen(s.id)
    } catch (e) {
      setBusy(null)
      setError((e as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-h2 text-h2 text-on-surface">재물조사</h2>
          <p className="text-caption text-on-surface-variant">
            ① ⬇ 자산현황 엑셀 다운로드 → ② 부서별 조사 완성 → ③ ⬆ 완료 엑셀 업로드
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="no-drag shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary text-on-primary px-3 py-1.5 text-label font-medium hover:bg-primary/90"
        >
          <Icon name={showForm ? 'close' : 'add'} className="text-[18px]" />
          {showForm ? '닫기' : '새 조사'}
        </button>
      </div>

      {/* 본부별 진행 현황 + 미확인 자산 상세 */}
      <SurveyProgressPanel />

      {showForm && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3 space-y-2.5">
          <label className="block">
            <span className="text-caption text-on-surface-variant">카테고리명</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="no-drag mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body outline-none focus:border-primary"
              placeholder="예: 2026년 정기재물조사"
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="block">
              <span className="text-caption text-on-surface-variant">자산 목록(마스터)</span>
              <select
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value)}
                className="no-drag mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body outline-none focus:border-primary"
              >
                {datasetSources.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className="text-caption text-on-surface-variant">조사 부서</span>
              <input
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                className="no-drag mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body outline-none focus:border-primary"
                placeholder="예: 기술기획부"
              />
            </label>
          </div>
          {error && <p className="text-error text-caption">{error}</p>}
          <button
            type="button"
            disabled={!!busy}
            onClick={create}
            className="no-drag w-full rounded-lg bg-primary text-on-primary py-2 text-body font-medium hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <Icon name="progress_activity" className="animate-spin text-[18px]" />
                {busy}
              </>
            ) : (
              '조사 시작'
            )}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {sessions.length === 0 && !showForm && (
          <p className="text-center text-on-surface-variant text-body-sm py-6">
            진행 중인 재물조사가 없습니다.
          </p>
        )}
        {sessions.map((s) => {
          const stats = sessionStats(s)
          return (
            <div
              key={s.id}
              className="rounded-xl border border-outline-variant bg-surface-container-low p-3 space-y-2"
            >
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => onOpen(s.id)} className="no-drag flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-h3 text-h3 text-on-surface truncate">{s.name}</span>
                    {s.completed && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded bg-success/15 text-success text-[10px] font-semibold">
                        완료
                      </span>
                    )}
                    {(s as SurveySession & { submittedAt?: string }).submittedAt && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded bg-secondary/15 text-secondary text-[10px] font-semibold">
                        서버 등록됨
                      </span>
                    )}
                    {s.uploadedAt && !(s as SurveySession & { submittedAt?: string }).submittedAt && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold">
                        동기화됨
                      </span>
                    )}
                  </div>
                  <p className="text-caption text-on-surface-variant truncate">
                    {s.parentDept} · {s.dept || '-'} · 총 {stats.total}건 · 확인 {stats.confirmed} · 이상 {stats.abnormal}
                  </p>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  {/* ① 본부별 현재자산 엑셀 다운로드 */}
                  <button
                    type="button"
                    onClick={(e) => void handleDownloadExcel(s.datasetId, e)}
                    disabled={downloadingId === s.datasetId}
                    title="① 본부별 현재자산 엑셀 다운로드"
                    className="no-drag w-8 h-8 flex items-center justify-center rounded-full text-primary hover:bg-primary/10 disabled:opacity-50"
                    aria-label="자산현황 다운로드"
                  >
                    <Icon name={downloadingId === s.datasetId ? 'progress_activity' : 'download'} className={`text-[18px] ${downloadingId === s.datasetId ? 'animate-spin' : ''}`} />
                  </button>
                  {/* ③ 완성된 재물조사 엑셀 업로드 */}
                  <ExcelUploadButton session={s} onDone={flashDl} />
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`'${s.name}' 조사를 삭제할까요?`)) deleteSession(s.id)
                    }}
                    className="no-drag w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-error/10 hover:text-error"
                    aria-label="삭제"
                  >
                    <Icon name="delete" className="text-[18px]" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── 앱 설치 QR ─────────────────────────────────────── */}
      <SessionListInstallQr />

      {dlToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] rounded-full bg-on-surface text-surface px-4 py-2 text-body-sm shadow-lg">
          {dlToast}
        </div>
      )}
    </div>
  )
}

/** QR 캔버스 — url을 QR 이미지로 렌더 */
function QrCanvas({ url, size = 160 }: { url: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(false)
    import('qrcode').then(({ default: QRCode }) => {
      if (!canvasRef.current) return
      QRCode.toCanvas(canvasRef.current, url, {
        width: size,
        margin: 2,
        color: { dark: '#1f2328', light: '#ffffff' },
      }).then(() => setReady(true)).catch(() => {})
    })
  }, [url, size])
  return (
    <div className={`rounded-2xl border-2 border-primary/20 bg-white p-2 shadow-sm transition-opacity ${ready ? 'opacity-100' : 'opacity-20'}`}>
      <canvas ref={canvasRef} className="block" />
    </div>
  )
}

/** 조사 목록 하단 — 앱 설치 QR 카드 */
function SessionListInstallQr() {
  const installUrl = inventoryInstallUrl()
  const [enlarged, setEnlarged] = useState(false)

  return (
    <>
      {/* 전체화면 QR 오버레이 — 폰 카메라가 크게 잡을 수 있도록 */}
      {enlarged && (
        <div
          className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center gap-6 cursor-zoom-out"
          onClick={() => setEnlarged(false)}
        >
          <QrCanvas url={installUrl} size={280} />
          <p className="text-white text-sm opacity-70">탭하면 닫힘</p>
          <p className="font-mono text-white/60 text-xs break-all max-w-xs text-center px-4">
            {installUrl}
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col items-center gap-3 text-center">
        {/* QR 클릭하면 전체화면으로 확대 */}
        <button
          type="button"
          onClick={() => setEnlarged(true)}
          title="클릭하면 크게 보기"
          className="no-drag cursor-zoom-in"
        >
          <QrCanvas url={installUrl} size={180} />
        </button>
        <div className="space-y-1">
          <p className="text-body-sm font-semibold text-on-surface">📱 QR로 재물조사 앱 설치</p>
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            QR을 <strong>클릭하면 크게</strong> 볼 수 있습니다.<br />
            폰 카메라로 찍으면 설치 안내 페이지가 열립니다.
          </p>
        </div>
        <a
          href={installUrl}
          target="_blank"
          rel="noreferrer"
          className="no-drag text-[10px] font-mono text-primary underline bg-surface-container rounded-lg px-2 py-1 break-all max-w-xs"
        >
          {installUrl}
        </a>
      </div>
    </>
  )
}

/* ------------------------------ Survey runner ------------------------------ */

function SurveyRunner({
  session,
  userName,
  userDept,
  isAdmin,
  onBack,
}: {
  session: SurveySession
  userName: string
  userDept: string
  isAdmin: boolean
  onBack: () => void
}) {
  const [ready, setReady] = useState(false)
  const [loadMsg, setLoadMsg] = useState('자산 데이터 불러오는 중...')
  const [scanOpen, setScanOpen] = useState(false)
  const [continuousScan, setContinuousScan] = useState(false)
  const [manual, setManual] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftPhotos, setDraftPhotos] = useState<StoredPhoto[]>([])
  const [photoBusy, setPhotoBusy] = useState(false)
  const [notFound, setNotFound] = useState(false)
  // ERP 대조 파일 — 마스터 미조회 자산의 자산명을 자동으로 찾아 채웁니다.
  const [erp, setErp] = useState<ErpStore | null>(null)
  const [erpBusy, setErpBusy] = useState(false)
  const [erpHit, setErpHit] = useState(false)
  /** 서버에 등록된 본부 ERP 원본을 자동으로 받아오는 중인지 / 어디서 온 파일인지 */
  const [erpSyncing, setErpSyncing] = useState(true)
  const [erpFromServer, setErpFromServer] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiVerdict, setAiVerdict] = useState<string | null>(null)
  // 이번 재물조사에서 이미 확인된 자산 정보
  const [confirmedBanner, setConfirmedBanner] = useState<{
    sessionId: string
    confirmedAt: string
    confirmedBy: string
  } | null>(null)
  // 전사 병합용 원본 파일 (관리자)
  const [surveyMasterFile, setSurveyMasterFile] = useState<File | null>(null)
  const [merging, setMerging] = useState(false)
  // 검수 결과 반영 산출물 — 운영관리부 대조에 쓸 원본 양식 파일과 진행 상태
  const [deptCompareFile, setDeptCompareFile] = useState<File | null>(null)
  const [exportBusy, setExportBusy] = useState<'erp' | 'compare' | null>(null)
  // 재물조사 결과 서버 등록
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{
    ok: boolean; submitted: number; error?: string
  } | null>(null)

  const stats = sessionStats(session)

  useEffect(() => {
    // forceRefresh=true: 서버에서 최신 데이터 받기 (confirmedInSession 반영)
    ensureDataset(
      session.datasetId,
      (phase) => setLoadMsg(phase === 'download' ? '서버에서 자산 데이터 다운로드 중...' : '자산 데이터 준비 중...'),
      true,
    )
      .then(() => setReady(true))
      .catch((e) => setLoadMsg(`불러오기 실패: ${(e as Error).message}`))
  }, [session.datasetId])

  // 관리자가 서버에 등록해 둔 본부 ERP 원본을 자동으로 받아 색인합니다.
  // (폰에서 조사자가 ERP 파일을 따로 첨부할 필요가 없도록)
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        // flash()는 아래에서 선언되므로 여기서 부르지 않습니다.
        // 로드 결과는 아래 ERP 줄의 "서버 자동" 배지로 보여줍니다.
        const { store } = await syncErpFromServer(session.parentDept)
        if (!alive) return
        setErp(store)
        setErpFromServer(!!store?.serverFileId)
      } catch {
        if (alive) setErp(await loadErpIndex().catch(() => null))
      } finally {
        if (alive) setErpSyncing(false)
      }
    })()
    return () => { alive = false }
  }, [session.parentDept])

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const loadDraftPhotos = (ids: string[]) => {
    if (ids.length) getPhotos(ids).then(setDraftPhotos)
    else setDraftPhotos([])
  }

  const doLookup = (raw: string) => {
    const norm = normalizeAssetNo(raw)
    if (!norm) return
    setAiVerdict(null)
    setConfirmedBanner(null)
    const asset = lookupAsset(session.datasetId, norm)
    if (asset) {
      const prev = session.results[asset.assetNo]
      setNotFound(false)
      const base = draftFromAsset(asset, userName, userDept, prev)
      // 마스터에 자산명이 비어 있으면 ERP 파일에서 보완
      const erpFill = base.name ? undefined : lookupErp(norm)
      if (erpFill?.name) base.name = erpFill.name
      setErpHit(!!erpFill?.name)
      setDraft(base)
      loadDraftPhotos(prev?.photoIds ?? [])
      if (asset.confirmedInSession && asset.confirmedInSession === session.id) {
        setConfirmedBanner({
          sessionId: asset.confirmedInSession,
          confirmedAt: asset.confirmedAt ?? '',
          confirmedBy: asset.confirmedBy ?? '',
        })
      }
    } else {
      const prev = session.results[norm]
      // 마스터에 없으면 ERP 대조 파일에서 자동 조회
      const erpAsset = lookupErp(norm)
      setNotFound(true)
      setErpHit(!!erpAsset)
      setDraft(
        erpAsset
          ? draftFromErp(erpAsset, norm, userName, userDept, prev)
          : emptyDraft(norm, userName, userDept, prev),
      )
      loadDraftPhotos(prev?.photoIds ?? [])
    }
  }

  const addPhotos = async (files: FileList | null) => {
    if (!files || !files.length || !draft) return
    setPhotoBusy(true)
    try {
      const saved: StoredPhoto[] = []
      for (const f of Array.from(files)) saved.push(await savePhoto(f))
      setDraft((d) => (d ? { ...d, photoIds: [...d.photoIds, ...saved.map((s) => s.id)] } : d))
      setDraftPhotos((p) => [...p, ...saved])
    } catch (e) {
      flash(`사진 처리 실패: ${(e as Error).message}`)
    } finally {
      setPhotoBusy(false)
    }
  }

  const removeDraftPhoto = (id: string) => {
    setDraft((d) => (d ? { ...d, photoIds: d.photoIds.filter((x) => x !== id) } : d))
    setDraftPhotos((p) => p.filter((x) => x.id !== id))
    void deletePhotos([id])
  }

  const clearDraft = () => {
    setDraft(null)
    setDraftPhotos([])
    setAiVerdict(null)
    setConfirmedBanner(null)
    setErpHit(false)
  }

  const handleErpFile = async (file: File | null) => {
    if (!file) return
    setErpBusy(true)
    try {
      const store = await importErpFile(file)
      setErp(store)
      setErpFromServer(false)
      flash(`ERP 대조 파일 등록: ${store.assets.length.toLocaleString()}건`)
    } catch (e) {
      flash(`ERP 파일 읽기 실패: ${(e as Error).message}`)
    } finally {
      setErpBusy(false)
    }
  }

  const handleErpClear = async () => {
    await clearErpFile()
    setErp(null)
    setErpHit(false)
    setErpFromServer(false)
    flash('ERP 대조 파일을 삭제했습니다.')
  }

  /** 서버에 등록된 ERP 원본을 다시 받아옵니다. */
  const reloadErpFromServer = async () => {
    setErpBusy(true)
    try {
      const { store, status } = await syncErpFromServer(session.parentDept)
      setErp(store)
      setErpFromServer(!!store?.serverFileId)
      flash(
        status === 'none'
          ? `${session.parentDept}에 등록된 ERP 자산현황이 서버에 없습니다. 관리자에게 요청하세요.`
          : status === 'failed'
            ? 'ERP 자산현황을 서버에서 받지 못했습니다.'
            : `ERP 자산현황 최신 상태 (${store?.assets.length.toLocaleString()}건)`,
      )
    } finally {
      setErpBusy(false)
    }
  }

  /** ① 검수 4열(검수완료/검수인부서/검수인/검수날짜)을 앞에 붙인 ERP 본부 파일 */
  const exportErpInspection = async () => {
    if (!erp) { flash('먼저 ERP 자산현황 파일을 등록하세요.'); return }
    setExportBusy('erp')
    try {
      const { buildErpWithInspection } = await import('./inspectionExport')
      const built = await buildErpWithInspection(erp, session)
      const summary = `자산 ${built.total}행 중 ${built.filled}행 검수 반영`
      const saved = await uploadInventoryFile({
        blob: built.blob,
        fileName: built.fileName,
        kind: 'erp-inspection',
        parentDept: session.parentDept,
        sessionId: session.id,
        summary,
      })
      saveBlobAs(built.blob, built.fileName)
      flash(saved.ok ? `${summary} — 서버 보관 + 기기 저장 완료` : `${summary} — 기기 저장됨 (서버 보관 실패: ${saved.error})`)
    } catch (e) {
      flash(`검수 반영 파일 생성 실패: ${(e as Error).message}`)
    } finally {
      setExportBusy(null)
    }
  }

  /** ② 운영관리부 양식의 설치부서를 ERP와 대조해 노랑(동일)/주황(변경)으로 칠한 파일 */
  const exportDeptComparison = async () => {
    if (!erp) { flash('먼저 ERP 자산현황 파일을 등록하세요.'); return }
    if (!deptCompareFile) { flash('운영관리부 재물조사 양식 파일을 첨부하세요.'); return }
    setExportBusy('compare')
    try {
      const { buildDeptComparison } = await import('./inspectionExport')
      const built = await buildDeptComparison(await deptCompareFile.arrayBuffer(), erp, session)
      const summary = `동일 ${built.same} · 변경 ${built.changed} · 미대조 ${built.unmatched}`
      const saved = await uploadInventoryFile({
        blob: built.blob,
        fileName: built.fileName,
        kind: 'dept-comparison',
        parentDept: session.parentDept,
        sessionId: session.id,
        summary,
      })
      saveBlobAs(built.blob, built.fileName)
      flash(saved.ok ? `${summary} — 서버 보관 + 기기 저장 완료` : `${summary} — 기기 저장됨 (서버 보관 실패: ${saved.error})`)
    } catch (e) {
      flash(`대조 파일 생성 실패: ${(e as Error).message}`)
    } finally {
      setExportBusy(null)
    }
  }

  const handleScan = async (text: string) => {
    setScanOpen(false)
    setManual(text)

    if (continuousScan) {
      const norm = text.trim().toUpperCase().replace(/\s+/g, '')
      if (!norm) return

      // Already surveyed → alert and open for edit
      if (session.results[norm]) {
        flash(`이미 조사된 자산입니다: ${norm}`)
        doLookup(text)
        return
      }

      const asset = lookupAsset(session.datasetId, norm)
      if (!asset) {
        // Not found → fall through to manual input (ERP 파일이 있으면 자산명은 자동으로 채워짐)
        const erpAsset = lookupErp(norm)
        flash(
          erpAsset?.name
            ? `마스터 미조회: ${norm} — ERP에서 「${erpAsset.name}」 자동 입력. 확인 후 저장하세요`
            : `마스터 미조회: ${norm} — 직접 입력하세요`,
        )
        doLookup(text)
        return
      }

      // Auto-save as 정상
        const result: SurveyResult = {
          assetNo: asset.assetNo,
          name: asset.name,
          location: asset.location,
          dept: asset.dept,
          model: asset.model,
          spec: asset.spec,
          status: '정상',
          stickerMissing: false,
          note: '',
          confirmed: true,
          verifier: userName,
          verifierDept: userDept,
          surveyedAt: new Date().toISOString(),
          matched: true,
        }
      await upsertResult(session.id, result)
      flash(`✓ 저장: ${asset.assetNo}`)
      setManual('')
      // Re-open scanner for next scan
      setScanOpen(true)
      return
    }

    doLookup(text)
  }

  const save = async () => {
    if (!draft) return
    const result: SurveyResult = {
      assetNo: draft.assetNo,
      name: draft.name,
      location: draft.location,
      dept: draft.dept,
      model: draft.model,
      spec: draft.spec,
      status: draft.status,
      stickerMissing: draft.stickerMissing,
      note: draft.note,
      confirmed: true,
      verifier: draft.verifier || userName,
      verifierDept: draft.verifierDept || userDept,
      surveyedAt: new Date().toISOString(),
      matched: draft.matched,
      photoIds: draft.photoIds.length ? draft.photoIds : undefined,
      aiChecked: aiVerdict ? true : undefined,
      aiVerdict: aiVerdict ?? undefined,
    }
    await upsertResult(session.id, result)
    flash(`저장됨: ${draft.assetNo}`)
    setManual('')
    setNotFound(false)
    clearDraft()
  }

  const runAi = async () => {
    if (!draft) return
    setAiBusy(true)
    setAiVerdict(null)
    const asset = draft.matched ? lookupAsset(session.datasetId, draft.assetNo) : undefined
    const res = await aiVerifyAsset(asset, {
      assetNo: draft.assetNo,
      name: draft.name,
      location: draft.location,
      dept: draft.dept,
      model: draft.model,
      spec: draft.spec,
      status: draft.status,
      stickerMissing: draft.stickerMissing,
      note: draft.note,
      confirmed: false,
      verifier: draft.verifier,
      verifierDept: draft.verifierDept,
      surveyedAt: '',
      matched: draft.matched,
    })
    setAiVerdict(res.verdict)
    setAiBusy(false)
  }

  // 파일③: 본부별 결과 엑셀 다운로드
  const exportDivisionResult = () => {
    const dataset = getLoadedDataset(session.datasetId)
    const assets = dataset?.assets ?? []
    const name = downloadDivisionResult(session, assets)
    flash(`파일③ 내보내기: ${name}`)
  }

  // 기존 세션 단순 엑셀
  const exportExcel = () => {
    const name = downloadSessionExcel(session)
    flash(`엑셀 내보내기: ${name}`)
  }

  // 전사 병합: 운영관리부 원본 파일에 본부 결과 덮어쓰기
  const doMergeSurveyFile = async () => {
    if (!surveyMasterFile) return
    setMerging(true)
    try {
      const buf = await surveyMasterFile.arrayBuffer()
      const { wb } = await buildMergedSurveyWorkbook(buf, session)
      const name = downloadMergedSurveyFile(wb, session)
      flash(`전사 병합 완료: ${name}`)
      setSurveyMasterFile(null)
    } catch (e) {
      flash(`병합 실패: ${(e as Error).message}`)
    } finally {
      setMerging(false)
    }
  }

  const upload = async () => {
    const res = await uploadSession(session)
    flash(res.message)
  }

  // 재물조사 완료 후 서버에 최종 등록 (완료 처리 포함)
  const submitToServer = async () => {
    const resultList = Object.values(session.results)
    if (resultList.length === 0) {
      flash('조사된 자산이 없습니다.')
      return
    }
    if (!confirm(`조사 결과 ${resultList.length}건을 서버에 최종 등록하고 완료 처리 하시겠습니까?`)) return
    setSubmitting(true)
    setSubmitResult(null)
    // 서버에 세션이 없을 수 있으므로 먼저 임시 동기화
    await uploadSession(session)
    const res = await submitSurveyResults(session.id, resultList)
    setSubmitting(false)
    setSubmitResult(res)
    if (res.ok) {
      flash(`✅ ${res.submitted}건 서버 등록 완료!`)
    } else {
      flash(`등록 실패: ${res.error}`)
    }
  }

  const editExisting = (assetNo: string) => {
    const r = session.results[assetNo]
    if (!r) return
    setManual(assetNo)
    const asset = r.matched ? lookupAsset(session.datasetId, assetNo) : undefined
    setDraft(asset ? draftFromAsset(asset, userName, userDept, r) : emptyDraft(assetNo, userName, userDept, r))
    loadDraftPhotos(r.photoIds ?? [])
    setNotFound(!r.matched)
    setAiVerdict(r.aiVerdict ?? null)
  }

  const deleteResult = (assetNo: string) => {
    const r = session.results[assetNo]
    if (r?.photoIds?.length) void deletePhotos(r.photoIds)
    void removeResult(session.id, assetNo)
  }

  const savedList = Object.values(session.results).sort((a, b) =>
    (b.surveyedAt || '').localeCompare(a.surveyedAt || ''),
  )

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="no-drag w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high text-on-surface-variant"
          aria-label="뒤로"
        >
          <Icon name="arrow_back" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-h3 text-h3 text-on-surface truncate">{session.name}</h2>
          <p className="text-caption text-on-surface-variant truncate">
            {session.parentDept} · 총 {stats.total} · 확인 {stats.confirmed} · 이상 {stats.abnormal}
          </p>
        </div>
      </div>

      {!ready ? (
        <div className="flex items-center justify-center gap-2 text-on-surface-variant text-body-sm py-8">
          <Icon name="progress_activity" className="animate-spin" />
          {loadMsg}
        </div>
      ) : (
        <>
          {/* Scan / manual entry */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              className="no-drag flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-on-primary py-2.5 text-body font-medium hover:bg-primary/90"
            >
              <Icon name="qr_code_scanner" />
              QR 스캔
            </button>
            <button
              type="button"
              onClick={() => setContinuousScan((v) => !v)}
              title="연속 스캔 모드: 정상 자산을 스캔 즉시 자동 저장"
              className={`no-drag px-3 py-2.5 rounded-lg border text-body-sm font-medium transition-colors ${
                continuousScan
                  ? 'bg-success/15 border-success text-success'
                  : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <Icon name="bolt" className="text-[18px]" />
              {continuousScan ? '연속ON' : '연속'}
            </button>
          </div>
          {continuousScan && (
            <p className="text-caption text-success bg-success/10 rounded-lg px-3 py-1.5">
              ⚡ 연속 스캔 모드 — 마스터 조회 자산은 스캔 즉시 정상으로 저장됩니다. 미조회 자산은 수동 입력이 필요합니다.
            </p>
          )}
          <div className="flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doLookup(manual)}
              placeholder="자산번호 직접 입력 (예: QL00069-0183-000)"
              className="no-drag flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => doLookup(manual)}
              className="no-drag shrink-0 rounded-lg border border-outline-variant px-3 py-2 text-body-sm hover:bg-surface-container-high"
            >
              조회
            </button>
          </div>

          {/* ERP 자산현황 — 관리자가 서버에 등록한 본부 파일을 자동으로 받아옵니다. */}
          <div className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2">
            <Icon name="table_view" className="shrink-0 text-[18px] text-on-surface-variant" />
            <div className="min-w-0 flex-1">
              {erpSyncing ? (
                <p className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                  <Icon name="progress_activity" className="animate-spin text-[13px]" />
                  ERP 자산현황을 서버에서 불러오는 중...
                </p>
              ) : erp ? (
                <>
                  <p className="truncate text-caption text-on-surface">
                    ERP 자산현황: {erp.fileName}
                    {erpFromServer && (
                      <span className="ml-1 rounded bg-success/12 px-1 py-0.5 text-[10px] font-semibold text-success">
                        서버 자동
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-on-surface-variant">
                    {erp.assets.length.toLocaleString()}건 · 마스터 미조회 자산의 자산명을 자동 입력합니다
                  </p>
                </>
              ) : (
                <p className="text-[11px] leading-relaxed text-warning">
                  {session.parentDept}에 등록된 ERP 자산현황이 서버에 없습니다. 관리자에게 등록을 요청하거나 직접 첨부하세요.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void reloadErpFromServer()}
              disabled={erpBusy || erpSyncing}
              title="서버에서 다시 불러오기"
              className="no-drag shrink-0 rounded p-1 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
            >
              <Icon name={erpBusy ? 'progress_activity' : 'cloud_download'} className={`text-[16px] ${erpBusy ? 'animate-spin' : ''}`} />
            </button>
            <label className="no-drag shrink-0 cursor-pointer rounded-lg border border-outline-variant px-2.5 py-1.5 text-[11px] hover:bg-surface-container-high">
              {erpBusy ? '읽는 중…' : erp ? '직접 교체' : '직접 첨부'}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={erpBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  e.target.value = '' // 같은 파일 다시 선택해도 change가 걸리도록
                  void handleErpFile(file)
                }}
              />
            </label>
            {erp && (
              <button
                type="button"
                onClick={() => void handleErpClear()}
                title="ERP 자산현황 삭제"
                className="no-drag shrink-0 rounded p-1 text-on-surface-variant hover:bg-error/10 hover:text-error"
              >
                <Icon name="close" className="text-[16px]" />
              </button>
            )}
          </div>

          {/* Lookup / edit panel */}
          {draft && (
            <div className="rounded-xl border border-primary/30 bg-surface-container-low p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-body-sm font-semibold text-on-surface">{draft.assetNo}</span>
                {notFound ? (
                  erpHit ? (
                    <span className="px-2 py-0.5 rounded bg-warning/15 text-warning text-[11px] font-semibold">
                      마스터 미조회 · ERP 자동 입력
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-error/15 text-error text-[11px] font-semibold">
                      마스터 미조회
                    </span>
                  )
                ) : (
                  <span className="px-2 py-0.5 rounded bg-success/15 text-success text-[11px] font-semibold">
                    조회됨
                  </span>
                )}
              </div>

              {/* ✅ 이번 재물조사에서 이미 확인된 자산 배너 */}
              {confirmedBanner && (
                <div className="flex items-start gap-2 rounded-lg bg-primary/8 border border-primary/25 px-3 py-2">
                  <Icon name="verified" className="text-primary text-[18px] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-body-sm font-semibold text-primary">이번 재물조사에서 확인된 자산입니다.</p>
                    <p className="text-caption text-on-surface-variant mt-0.5">
                      확인자: {confirmedBanner.confirmedBy || '-'}
                      {confirmedBanner.confirmedAt && (
                        <> · {confirmedBanner.confirmedAt.slice(0, 16).replace('T', ' ')}</>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {(!notFound || erpHit) && (
                <p className="text-caption text-on-surface-variant">
                  모델 {draft.model || '-'} · 규격 {draft.spec || '-'} · 설치부서 {draft.dept || '-'}
                  {notFound && erpHit && <span className="text-warning"> · ERP 파일 기준</span>}
                </p>
              )}

              <label className="block">
                <span className="text-caption text-on-surface-variant">자산명</span>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="no-drag mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="text-caption text-on-surface-variant">설치장소</span>
                <input
                  value={draft.location}
                  onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                  className="no-drag mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm outline-none focus:border-primary"
                />
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block">
                  <span className="text-caption text-on-surface-variant">이상유무</span>
                  <select
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value as SurveyStatus })}
                    className="no-drag mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm outline-none focus:border-primary"
                  >
                    {SURVEY_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-caption text-on-surface-variant">이상유무 비고</span>
                  <input
                    value={draft.note}
                    onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                    className="no-drag mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm outline-none focus:border-primary"
                    placeholder="이상 사유 등"
                  />
                </label>
              </div>
              {/* 확인자 정보 */}
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block">
                  <span className="text-caption text-on-surface-variant">확인자</span>
                  <input
                    value={draft.verifier}
                    onChange={(e) => setDraft({ ...draft, verifier: e.target.value })}
                    className="no-drag mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm outline-none focus:border-primary"
                    placeholder="이름"
                  />
                </label>
                <label className="block">
                  <span className="text-caption text-on-surface-variant">확인자 부서</span>
                  <input
                    value={draft.verifierDept}
                    onChange={(e) => setDraft({ ...draft, verifierDept: e.target.value })}
                    className="no-drag mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm outline-none focus:border-primary"
                    placeholder="부서명"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-body-sm text-on-surface">
                <input
                  type="checkbox"
                  checked={draft.stickerMissing}
                  onChange={(e) => setDraft({ ...draft, stickerMissing: e.target.checked })}
                  className="no-drag rounded"
                />
                자산스티커 미부착
              </label>
              {/* 현물 사진 (휴대폰 카메라 / 갤러리) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-caption text-on-surface-variant">현물 사진 ({draftPhotos.length})</span>
                  <label className="no-drag inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-2.5 py-1.5 text-label cursor-pointer hover:bg-surface-container-high">
                    <Icon name={photoBusy ? 'progress_activity' : 'photo_camera'} className={photoBusy ? 'animate-spin text-[16px]' : 'text-[16px]'} />
                    사진 촬영
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      disabled={photoBusy}
                      onChange={(e) => {
                        void addPhotos(e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>
                {draftPhotos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {draftPhotos.map((p) => (
                      <div key={p.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-outline-variant">
                        <a href={p.dataUrl} target="_blank" rel="noreferrer" className="no-drag block w-full h-full">
                          <img src={p.dataUrl} alt="현물 사진" className="w-full h-full object-cover" />
                        </a>
                        <button
                          type="button"
                          onClick={() => removeDraftPhoto(p.id)}
                          className="no-drag absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/55 text-white hover:bg-error"
                          aria-label="사진 삭제"
                        >
                          <Icon name="close" className="text-[14px]" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {aiVerdict && (
                <div className="rounded-lg bg-surface-container-high p-2 text-caption text-on-surface flex gap-1.5">
                  <Icon name="smart_toy" className="text-primary text-[16px] shrink-0" />
                  <span>{aiVerdict}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                {aiAvailable() && (
                  <button
                    type="button"
                    onClick={runAi}
                    disabled={aiBusy}
                    className="no-drag inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-2 text-body-sm hover:bg-surface-container-high disabled:opacity-60"
                  >
                    <Icon name={aiBusy ? 'progress_activity' : 'smart_toy'} className={aiBusy ? 'animate-spin text-[16px]' : 'text-[16px]'} />
                    AI 확인
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearDraft}
                  className="no-drag rounded-lg border border-outline-variant px-3 py-2 text-body-sm hover:bg-surface-container-high"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={save}
                  className="no-drag flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-on-primary px-3 py-2 text-body-sm font-medium hover:bg-primary/90"
                >
                  <Icon name="save" className="text-[16px]" />
                  건별 저장
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            {/* ── 엑셀 다운로드 → 작성 → 업로드 워크플로 (핵심) ── */}
            <div className="rounded-xl border-2 border-success/30 bg-success/4 p-3 space-y-2">
              <p className="text-caption font-semibold text-on-surface flex items-center gap-1.5">
                <Icon name="table_chart" className="text-[16px] text-success" />
                엑셀로 재물조사 (권장)
              </p>
              <p className="text-[11px] text-on-surface-variant">
                ① 자산현황 엑셀을 받아 부서확인 열을 부서별로 채운 뒤 ③ 완성 파일을 업로드하면 결과가 자동 등록됩니다.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void downloadDatasetExcel(session.datasetId)}
                  className="no-drag inline-flex items-center gap-1.5 rounded-lg bg-primary/10 text-primary px-3 py-2 text-label font-medium hover:bg-primary/20"
                >
                  <Icon name="download" className="text-[16px]" />
                  ① 자산현황 엑셀 받기
                </button>
                <ExcelUploadButton session={session} onDone={(msg) => flash(msg)} />
              </div>
            </div>

            {/* ★ QR 스캔 결과 서버 등록 */}
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3 space-y-2">
              <p className="text-caption font-semibold text-on-surface flex items-center gap-1.5">
                <Icon name="cloud_upload" className="text-[16px] text-primary" />
                QR 스캔 결과 서버 등록
              </p>
              <p className="text-[11px] text-on-surface-variant">
                QR 스캔으로 조사한 결과를 서버에 최종 등록합니다. 등록 후 완료 처리됩니다.
              </p>
              {submitResult?.ok && (
                <div className="flex items-center gap-1.5 rounded-lg bg-success/10 border border-success/30 px-2.5 py-2 text-caption text-success">
                  <Icon name="check_circle" className="text-[16px]" />
                  {submitResult.submitted}건 등록 완료
                </div>
              )}
              {submitResult && !submitResult.ok && (
                <div className="flex items-center gap-1.5 rounded-lg bg-error/10 border border-error/30 px-2.5 py-2 text-caption text-error">
                  <Icon name="error" className="text-[16px]" />
                  {submitResult.error}
                </div>
              )}
              <button
                type="button"
                disabled={submitting || stats.total === 0}
                onClick={() => void submitToServer()}
                className="no-drag w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-on-primary py-2.5 text-body-sm font-medium hover:bg-primary/90 disabled:opacity-60"
              >
                {submitting ? (
                  <><Icon name="progress_activity" className="animate-spin text-[18px]" />등록 중...</>
                ) : (
                  <><Icon name="send" className="text-[18px]" />조사 결과 {stats.total}건 서버에 등록</>
                )}
              </button>
            </div>

            {/* 보조 액션 */}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={upload}
                className="no-drag inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-label hover:bg-surface-container-high">
                <Icon name="sync" className="text-[18px]" />임시 동기화
              </button>
              <button type="button"
                onClick={() => markCompleted(session.id, !session.completed)}
                className={`no-drag inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-label ${
                  session.completed ? 'bg-success/15 text-success' : 'border border-outline-variant hover:bg-surface-container-high'
                }`}>
                <Icon name="check_circle" className="text-[18px]" />
                {session.completed ? '완료됨' : '완료 처리'}
              </button>
            </div>

            {/* 엑셀 내보내기 */}
            <div className="rounded-lg border border-outline-variant bg-surface-container-low p-2.5 space-y-2">
              <p className="text-caption font-medium text-on-surface-variant">엑셀 내보내기</p>
              <div className="flex flex-wrap gap-1.5">
                {/* 파일③: 본부별 결과 */}
                <button type="button" onClick={exportDivisionResult}
                  className="no-drag inline-flex items-center gap-1.5 rounded-lg bg-primary/10 text-primary px-3 py-1.5 text-label hover:bg-primary/20">
                  <Icon name="table_chart" className="text-[16px]" />본부별 결과 엑셀
                </button>
                {/* 기존 세션 엑셀 */}
                <button type="button" onClick={exportExcel}
                  className="no-drag inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-label hover:bg-surface-container-high">
                  <Icon name="download" className="text-[16px]" />전체 내보내기
                </button>
              </div>

              {/* 검수 결과 반영 — 서버 보관 + 기기 저장 */}
              <div className="pt-1 border-t border-outline-variant/50 space-y-1.5">
                <p className="text-[11px] leading-relaxed text-on-surface-variant">
                  검수 결과를 엑셀에 반영합니다. 만든 파일은 서버에 보관되고 기기에도 저장됩니다.
                </p>
                {!erp && (
                  <p className="text-[11px] text-warning">
                    ERP 자산현황이 필요합니다 — 관리자가 설정 탭에서 이 본부의 ERP 파일을 등록하면 자동으로 불러옵니다.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void exportErpInspection()}
                    disabled={!erp || exportBusy !== null}
                    className="no-drag inline-flex items-center gap-1.5 rounded-lg bg-primary/10 text-primary px-3 py-1.5 text-label hover:bg-primary/20 disabled:opacity-50"
                  >
                    {exportBusy === 'erp'
                      ? <><Icon name="progress_activity" className="animate-spin text-[16px]" />만드는 중...</>
                      : <><Icon name="playlist_add_check" className="text-[16px]" />검수 반영 ERP 파일</>
                    }
                  </button>
                  <label className="no-drag inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-outline-variant px-2.5 py-1.5 text-label text-on-surface-variant hover:bg-surface-container-high">
                    <Icon name="upload_file" className="text-[16px]" />
                    <span className="max-w-[160px] truncate">
                      {deptCompareFile ? deptCompareFile.name : '운영관리부 양식 첨부'}
                    </span>
                    <input
                      type="file"
                      accept=".xlsx"
                      className="hidden"
                      onChange={(e) => setDeptCompareFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void exportDeptComparison()}
                    disabled={!erp || !deptCompareFile || exportBusy !== null}
                    className="no-drag inline-flex items-center gap-1.5 rounded-lg bg-secondary/15 text-secondary px-3 py-1.5 text-label hover:bg-secondary/25 disabled:opacity-50"
                  >
                    {exportBusy === 'compare'
                      ? <><Icon name="progress_activity" className="animate-spin text-[16px]" />대조 중...</>
                      : <><Icon name="palette" className="text-[16px]" />설치부서 대조 (노랑/주황)</>
                    }
                  </button>
                </div>
              </div>

              {/* 전사 병합 — 관리자 전용 */}
              {isAdmin && (
                <div className="pt-1 border-t border-outline-variant/50">
                  <p className="text-[11px] text-on-surface-variant mb-1.5">
                    [관리자] 운영관리부 전체 양식 파일에 이 본부 결과를 병합해 저장합니다.
                  </p>
                  <label className="no-drag inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-2.5 py-1.5 text-label cursor-pointer hover:bg-surface-container-high text-on-surface-variant">
                    <Icon name="upload_file" className="text-[16px]" />
                    {surveyMasterFile ? surveyMasterFile.name : '전체 양식 파일 첨부'}
                    <input type="file" accept=".xlsx" className="hidden"
                      onChange={(e) => setSurveyMasterFile(e.target.files?.[0] ?? null)} />
                  </label>
                  {surveyMasterFile && (
                    <button type="button" onClick={() => void doMergeSurveyFile()} disabled={merging}
                      className="no-drag ml-2 inline-flex items-center gap-1.5 rounded-lg bg-secondary/15 text-secondary px-3 py-1.5 text-label hover:bg-secondary/25 disabled:opacity-50">
                      {merging
                        ? <><Icon name="progress_activity" className="animate-spin text-[16px]" />병합 중...</>
                        : <><Icon name="merge" className="text-[16px]" />전사 파일에 병합 저장</>
                      }
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Saved items */}
          <div className="space-y-1.5">
            <p className="text-caption text-on-surface-variant">조사 내역 ({savedList.length})</p>
            {savedList.map((r) => (
              <div
                key={r.assetNo}
                className="rounded-lg border border-outline-variant bg-surface-container-low px-2.5 py-2 flex items-center gap-2"
              >
                <button type="button" onClick={() => editExisting(r.assetNo)} className="no-drag flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-on-surface-variant">{r.assetNo}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_TONE[r.status]}`}>
                      {r.status}
                    </span>
                    {r.stickerMissing && (
                      <span className="px-1.5 py-0.5 rounded bg-warning/15 text-warning text-[10px]">미부착</span>
                    )}
                    {(r.photoIds?.length ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
                        <Icon name="photo_camera" className="text-[12px]" />
                        {r.photoIds!.length}
                      </span>
                    )}
                  </div>
                  <p className="text-body-sm text-on-surface truncate">{r.name || '(자산명 없음)'}</p>
                  <p className="text-caption text-on-surface-variant truncate">
                    {r.location || '-'} · 확인자 {r.verifier}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => deleteResult(r.assetNo)}
                  className="no-drag shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-error/10 hover:text-error"
                  aria-label="내역 삭제"
                >
                  <Icon name="delete" className="text-[16px]" />
                </button>
              </div>
            ))}
            {savedList.length === 0 && (
              <p className="text-center text-on-surface-variant text-caption py-4">
                QR을 스캔해 첫 자산을 조사하세요.
              </p>
            )}
          </div>
        </>
      )}

      {scanOpen && <QrScanner onResult={handleScan} onClose={() => setScanOpen(false)} />}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] rounded-full bg-on-surface text-surface px-4 py-2 text-body-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────── Dataset Manager ─────────────────────── */

interface DatasetRow {
  id: string
  title: string
  parentDept: string
  onServer: boolean
  assetCount?: number
  uploadedAt?: string
}

/** 현장에서 만들어져 서버에 모인 산출물 파일 한 줄. */
function ResultFileRow({ file }: { file: InventoryFileMeta }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const download = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await downloadInventoryFile(file.id)
      if (!res.ok) setError(res.error ?? '다운로드 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5">
      <div className="flex items-center gap-3">
        <Icon name="description" className="text-primary text-[20px] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-body-sm font-medium text-on-surface truncate">{file.fileName}</p>
          <p className="text-caption text-on-surface-variant truncate">
            {file.parentDept || '본부 미지정'}
            {file.summary && <> · {file.summary}</>}
            <> · {file.createdAt.slice(0, 16).replace('T', ' ')}</>
            <> · {(file.size / 1024).toFixed(0)} KB</>
          </p>
        </div>
        <button type="button" onClick={() => void download()} disabled={busy}
          className="no-drag shrink-0 inline-flex items-center gap-1 rounded-lg border border-outline-variant px-2.5 py-1.5 text-label hover:bg-surface-container-high disabled:opacity-50">
          <Icon name={busy ? 'progress_activity' : 'download'} className={`text-[16px] ${busy ? 'animate-spin' : ''}`} />
          내려받기
        </button>
      </div>
      {error && <p className="mt-1 text-caption text-error">{error}</p>}
    </div>
  )
}

/** 산출물 한 종류를 묶어 보여주는 섹션. */
function ResultFileSection({
  icon, title, hint, files, emptyText,
}: {
  icon: string; title: string; hint: string; files: InventoryFileMeta[]; emptyText: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon name={icon} className="text-primary text-[18px]" />
        <h4 className="text-body-sm font-semibold text-on-surface flex-1">{title}</h4>
        <span className="text-caption text-on-surface-variant">{files.length}건</span>
      </div>
      <p className="text-[11px] leading-relaxed text-on-surface-variant">{hint}</p>
      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed border-outline-variant py-5 text-center text-caption text-on-surface-variant">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-1.5">
          {files.map((f) => <ResultFileRow key={f.id} file={f} />)}
        </div>
      )}
    </div>
  )
}

/**
 * 데이터셋 탭 — 확인 전용.
 * 데이터셋 등록·삭제는 설정 탭(DB 파일 관리)에서만 합니다. 여기서는 현재 등록 상태와,
 * 현장에서 만들어져 서버에 모인 산출물 파일을 확인하고 내려받습니다.
 */
function DatasetManager({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<DatasetRow[]>([])
  const [inspectionFiles, setInspectionFiles] = useState<InventoryFileMeta[]>([])
  const [comparisonFiles, setComparisonFiles] = useState<InventoryFileMeta[]>([])
  const [busy, setBusy] = useState(true)

  const refresh = async () => {
    setBusy(true)
    try {
      const [all, server, erpFiles, cmpFiles] = await Promise.all([
        getAllDatasetSources(),
        fetchServerDatasets(),
        fetchInventoryFiles({ kind: 'erp-inspection' }),
        fetchInventoryFiles({ kind: 'dept-comparison' }),
      ])
      const byId = new Map(server.map((d) => [d.id, d]))
      setRows(
        all.map((d) => {
          const s = byId.get(d.id)
          return {
            id: d.id,
            title: d.title,
            parentDept: d.parentDept,
            onServer: !!s,
            assetCount: s?.assetCount,
            uploadedAt: s?.uploadedAt,
          }
        }),
      )
      setInspectionFiles(erpFiles)
      setComparisonFiles(cmpFiles)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-h3 text-h3 text-on-surface">자산 데이터셋</h3>
        <button type="button" onClick={() => void refresh()}
          className="no-drag inline-flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1.5 text-label hover:bg-surface-container-high">
          <Icon name="refresh" className="text-[16px]" />새로고침
        </button>
      </div>

      {isAdmin && (
        <p className="rounded-lg bg-primary/6 border border-primary/20 px-3 py-2 text-caption text-on-surface-variant">
          데이터셋 등록·삭제는 <strong className="text-primary">설정 탭 → DB 파일 관리</strong>에서 합니다. 이 화면은 확인 전용입니다.
        </p>
      )}

      {busy ? (
        <div className="flex items-center gap-2 text-on-surface-variant text-caption py-4">
          <Icon name="progress_activity" className="animate-spin text-[15px]" />불러오는 중...
        </div>
      ) : (
        <>
          {/* 등록된 자산 데이터셋 (읽기 전용) */}
          {rows.length === 0 ? (
            <p className="text-center text-caption text-on-surface-variant py-6">
              등록된 데이터셋이 없습니다.{isAdmin ? ' 설정 탭에서 두 파일을 올려 구성하세요.' : ' 관리자에게 DB 설정을 요청하세요.'}
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 flex items-center gap-3">
                  <Icon name="inventory_2" className="text-primary text-[20px] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium text-on-surface truncate">{r.title}</p>
                    <p className="text-caption text-on-surface-variant truncate">
                      {r.parentDept}
                      {r.assetCount !== undefined && <> · {r.assetCount.toLocaleString()}건</>}
                      {r.uploadedAt && <> · {r.uploadedAt.slice(0, 10)}</>}
                      {!r.onServer && <> · 앱 내장</>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 현장에서 올라온 산출물 */}
          <div className="space-y-4 pt-2 border-t border-outline-variant">
            <ResultFileSection
              icon="playlist_add_check"
              title="부서별 자산 현황 파일 (검수 반영)"
              hint="현장에서 검수한 결과가 맨 앞 4열(검수완료 · 검수인부서 · 검수인 · 검수날짜)로 들어간 본부별 ERP 파일입니다."
              files={inspectionFiles}
              emptyText="아직 올라온 부서별 자산 현황 파일이 없습니다."
            />
            <ResultFileSection
              icon="palette"
              title="운영관리부 전사 파일 (설치부서 대조)"
              hint="운영관리부 양식의 설치부서를 ERP와 대조해 칠한 파일입니다. 노란색은 이전과 동일, 주황색은 설치부서가 바뀐 자산입니다."
              files={comparisonFiles}
              emptyText="아직 생성된 운영관리부 전사 파일이 없습니다."
            />
          </div>
        </>
      )}
    </div>
  )
}

/* ─────────────────────── Stats View (admin) ───────────────────── */

/** 0~100% 진행률 막대. 100%면 초록. */
function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 1000) / 10 : 0
  const complete = total > 0 && done >= total
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-highest">
        <div
          className={`h-full rounded-full transition-all ${complete ? 'bg-success' : 'bg-primary'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={`shrink-0 text-[11px] font-semibold ${complete ? 'text-success' : 'text-on-surface-variant'}`}>
        {pct.toFixed(1)}%
      </span>
    </div>
  )
}

/**
 * 미확인(아직 조사되지 않은) 자산 목록.
 * 서버에서 데이터셋 자산과 조사 결과를 대조해 내려줍니다.
 */
function UnsurveyedAssetList({
  datasetId, dept, expectedTotal,
}: { datasetId?: string; dept?: string; expectedTotal?: number }) {
  const PAGE = 100
  const [assets, setAssets] = useState<UnsurveyedAsset[]>([])
  const [total, setTotal] = useState(expectedTotal ?? 0)
  const [busy, setBusy] = useState(true)

  const loadMore = useCallback(async (offset: number) => {
    setBusy(true)
    try {
      const res = await fetchUnsurveyedAssets({ datasetId, dept, limit: PAGE, offset })
      setTotal(res.total)
      setAssets((prev) => (offset === 0 ? res.assets : [...prev, ...res.assets]))
    } finally {
      setBusy(false)
    }
  }, [datasetId, dept])

  // setState는 모두 await 이후에 일어나지만 규칙이 호출을 따라 들어가 오탐합니다.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadMore(0) }, [loadMore])

  if (busy && assets.length === 0) {
    return (
      <div className="flex items-center gap-2 py-3 text-caption text-on-surface-variant">
        <Icon name="progress_activity" className="animate-spin text-[15px]" />미확인 자산 불러오는 중...
      </div>
    )
  }

  if (total === 0) {
    return (
      <p className="flex items-center justify-center gap-1.5 rounded-lg bg-success/8 py-3 text-caption text-success">
        <Icon name="check_circle" className="text-[16px]" />
        미확인 자산이 없습니다 — 100% 조사 완료
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-caption text-on-surface-variant">
        미확인 자산 <strong className="text-error">{total.toLocaleString()}</strong>건
        {assets.length < total && <> · {assets.length.toLocaleString()}건 표시 중</>}
      </p>
      <div className="overflow-x-auto rounded-lg border border-outline-variant">
        <table className="w-full min-w-[640px] text-caption">
          <thead className="bg-surface-container-low text-on-surface-variant">
            <tr>
              {['자산번호', '자산명', '모델/규격', '설치부서', '설치장소', '관리부서', '취득일자'].map((h) => (
                <th key={h} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/60">
            {assets.map((a) => (
              <tr key={a.assetNo} className="hover:bg-surface-container-low/60">
                <td className="whitespace-nowrap px-2 py-1.5 font-mono text-on-surface">{a.assetNo}</td>
                <td className="px-2 py-1.5 text-on-surface">{a.name || '-'}</td>
                <td className="px-2 py-1.5 text-on-surface-variant">
                  {[a.model, a.spec].filter(Boolean).join(' / ') || '-'}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-on-surface-variant">{a.dept}</td>
                <td className="px-2 py-1.5 text-on-surface-variant">{a.location || '-'}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-on-surface-variant">{a.manageDept || '-'}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-on-surface-variant">{a.acquiredAt || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {assets.length < total && (
        <button type="button" onClick={() => void loadMore(assets.length)} disabled={busy}
          className="no-drag w-full rounded-lg border border-outline-variant py-1.5 text-label text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50">
          {busy ? '불러오는 중...' : `${Math.min(PAGE, total - assets.length).toLocaleString()}건 더 보기`}
        </button>
      )}
    </div>
  )
}

/** 설치부서 한 줄 — 펼치면 확인자별 실적과 미확인 자산이 나옵니다. */
function DeptCoverageRow({ datasetId, dept }: { datasetId: string; dept: DeptCoverage }) {
  const [open, setOpen] = useState(false)
  const complete = dept.unsurveyed === 0 && dept.totalAssets > 0

  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="no-drag flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-container-low/60">
        <Icon name={open ? 'expand_less' : 'expand_more'} className="shrink-0 text-[18px] text-on-surface-variant" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-body-sm font-medium text-on-surface">{dept.dept}</span>
            {complete && <Icon name="check_circle" className="shrink-0 text-[14px] text-success" />}
          </div>
          <p className="text-[11px] text-on-surface-variant">
            전체 {dept.totalAssets.toLocaleString()} · 확인 {dept.confirmed.toLocaleString()}
            {dept.abnormal > 0 && <> · 이상 {dept.abnormal.toLocaleString()}</>}
            {dept.unsurveyed > 0 && <> · <span className="text-error">미확인 {dept.unsurveyed.toLocaleString()}</span></>}
            {dept.verifiers.length > 0 && <> · 확인자 {dept.verifiers.length}명</>}
          </p>
        </div>
        <div className="w-28 shrink-0">
          <ProgressBar done={dept.surveyed} total={dept.totalAssets} />
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-outline-variant/50 bg-surface-container-low/30 px-3 py-2.5">
          {/* 확인자별 */}
          <div className="space-y-1.5">
            <p className="text-caption font-medium text-on-surface-variant">확인자별 확인 개수</p>
            {dept.verifiers.length === 0 ? (
              <p className="text-[11px] text-on-surface-variant">아직 이 부서를 조사한 확인자가 없습니다.</p>
            ) : (
              <div className="space-y-1">
                {dept.verifiers.map((v) => (
                  <div key={`${v.verifier}|${v.verifierDept}`}
                    className="flex items-center gap-2 rounded-md bg-surface px-2.5 py-1.5">
                    <Icon name="person" className="shrink-0 text-[15px] text-primary" />
                    <span className="min-w-0 flex-1 truncate text-caption text-on-surface">
                      {v.verifier}
                      {v.verifierDept && <span className="text-on-surface-variant"> · {v.verifierDept}</span>}
                    </span>
                    <span className="shrink-0 text-caption font-semibold text-success">{v.confirmed.toLocaleString()}건 확인</span>
                    {v.abnormal > 0 && (
                      <span className="shrink-0 text-[11px] text-error">이상 {v.abnormal}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 미확인 자산 */}
          <div className="space-y-1.5">
            <p className="text-caption font-medium text-on-surface-variant">미확인 자산 상세</p>
            <UnsurveyedAssetList datasetId={datasetId} dept={dept.dept} expectedTotal={dept.unsurveyed} />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 조사 통계 — 데이터셋의 **전체 자산**을 분모로 삼아 100% 조사됐는지 보여줍니다.
 * 본부(데이터셋) → 설치부서 → 확인자 순으로 펼쳐집니다.
 * 관리자가 아니어도 볼 수 있습니다.
 */
function StatsView({ isAdmin }: { isAdmin: boolean }) {
  const [coverage, setCoverage] = useState<DatasetCoverage[]>([])
  const [sessions, setSessions] = useState<SessionStat[]>([])
  const [busy, setBusy] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [openDataset, setOpenDataset] = useState<string | null>(null)

  const load = async () => {
    setBusy(true)
    try {
      const [cov, sess] = await Promise.all([fetchCoverageStats(), fetchStats()])
      setCoverage(cov)
      setSessions(sess)
      setLastRefreshed(new Date())
      // 데이터셋이 하나뿐이면 자동으로 펼쳐 둡니다.
      setOpenDataset((prev) => prev ?? (cov.length === 1 ? cov[0].datasetId : null))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
    // 폰에서 올라오는 조사 결과를 30초마다 자동 갱신
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [])

  const totalAssets = coverage.reduce((a, d) => a + d.totalAssets, 0)
  const confirmed = coverage.reduce((a, d) => a + d.confirmed, 0)
  const surveyed = coverage.reduce((a, d) => a + d.surveyed, 0)
  const abnormal = coverage.reduce((a, d) => a + d.abnormal, 0)
  const unsurveyed = coverage.reduce((a, d) => a + d.unsurveyed, 0)
  const allDone = totalAssets > 0 && unsurveyed === 0

  /** 본부 → 부서 → 확인자를 한 시트에 펼쳐 내보냅니다. */
  const exportStats = () => {
    void import('xlsx').then(({ utils, writeFile }) => {
      const header = ['구분', '본부', '설치부서', '확인자', '확인자 부서', '전체 자산', '조사', '확인', '이상', '미확인', '진행률(%)']
      const rows: (string | number)[][] = []
      const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 1000) / 10 : 0)

      for (const d of coverage) {
        rows.push(['본부', d.parentDept, '', '', '', d.totalAssets, d.surveyed, d.confirmed, d.abnormal, d.unsurveyed, pct(d.surveyed, d.totalAssets)])
        for (const dept of d.depts) {
          rows.push(['부서', d.parentDept, dept.dept, '', '', dept.totalAssets, dept.surveyed, dept.confirmed, dept.abnormal, dept.unsurveyed, pct(dept.surveyed, dept.totalAssets)])
          for (const v of dept.verifiers) {
            rows.push(['확인자', d.parentDept, dept.dept, v.verifier, v.verifierDept, '', v.surveyed, v.confirmed, v.abnormal, '', ''])
          }
        }
      }

      const wb = utils.book_new()
      utils.book_append_sheet(wb, utils.aoa_to_sheet([header, ...rows]), '자산조사 통계')

      if (sessions.length > 0) {
        const sHeader = ['세션명', '본부', '부서', '조사건수', '확인건수', '이상건수', '완료여부', '생성일']
        const sRows = sessions.map((x) => [x.name, x.parentDept, x.dept, x.total, x.confirmed, x.abnormal, x.completed ? '완료' : '진행중', x.createdAt])
        utils.book_append_sheet(wb, utils.aoa_to_sheet([sHeader, ...sRows]), '조사 세션')
      }

      writeFile(wb, `재물조사_통계_${new Date().toISOString().slice(0, 10)}.xlsx`)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-h3 text-h3 text-on-surface">조사 통계</h3>
          {lastRefreshed && (
            <p className="text-[10px] text-on-surface-variant">
              마지막 갱신: {lastRefreshed.toLocaleTimeString('ko-KR')} · 30초 자동 갱신
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} disabled={busy}
            className="no-drag inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-label hover:bg-surface-container-high disabled:opacity-60">
            <Icon name={busy ? 'progress_activity' : 'refresh'} className={`text-[16px] ${busy ? 'animate-spin' : ''}`} />지금 갱신
          </button>
          <button type="button" onClick={exportStats}
            className="no-drag inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-label hover:bg-surface-container-high">
            <Icon name="download" className="text-[18px]" />통계 내보내기
          </button>
        </div>
      </div>

      {/* 전체 요약 — 분모는 데이터셋의 전체 자산 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ['전체 자산', totalAssets, 'text-on-surface'],
          ['확인 완료', confirmed, 'text-success'],
          ['미확인', unsurveyed, unsurveyed > 0 ? 'text-error' : 'text-success'],
          ['이상', abnormal, abnormal > 0 ? 'text-warning' : 'text-on-surface-variant'],
        ] as [string, number, string][]).map(([label, val, cls]) => (
          <div key={label} className="rounded-xl border border-outline-variant bg-surface-container-low p-3 text-center">
            <p className={`text-h2 font-bold ${cls}`}>{val.toLocaleString()}</p>
            <p className="text-caption text-on-surface-variant">{label}</p>
          </div>
        ))}
      </div>

      {/* 전체 진행률 */}
      {totalAssets > 0 && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <Icon name={allDone ? 'verified' : 'donut_large'} className={`text-[18px] ${allDone ? 'text-success' : 'text-primary'}`} />
            <span className="flex-1 text-body-sm font-medium text-on-surface">
              {allDone ? '전 자산 조사 완료 (100%)' : '자산조사 진행률'}
            </span>
            <span className="text-caption text-on-surface-variant">
              {surveyed.toLocaleString()} / {totalAssets.toLocaleString()}
            </span>
          </div>
          <ProgressBar done={surveyed} total={totalAssets} />
        </div>
      )}

      {busy && coverage.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-6 text-body-sm text-on-surface-variant">
          <Icon name="progress_activity" className="animate-spin" />통계 불러오는 중...
        </div>
      ) : coverage.length === 0 ? (
        <p className="py-4 text-center text-caption text-on-surface-variant">
          등록된 자산 데이터셋이 없습니다.{isAdmin ? ' 설정 탭에서 두 파일을 올려 구성하세요.' : ' 관리자에게 DB 설정을 요청하세요.'}
        </p>
      ) : (
        <div className="space-y-2">
          {/* 본부(데이터셋) 단위 */}
          {coverage.map((d) => {
            const open = openDataset === d.datasetId
            const done = d.unsurveyed === 0 && d.totalAssets > 0
            return (
              <div key={d.datasetId} className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low">
                <button type="button" onClick={() => setOpenDataset(open ? null : d.datasetId)}
                  className="no-drag flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-container-high/40">
                  <Icon name={open ? 'expand_less' : 'expand_more'} className="shrink-0 text-[20px] text-on-surface-variant" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-body-sm font-semibold text-on-surface">{d.parentDept}</span>
                      {done && (
                        <span className="shrink-0 rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                          100% 완료
                        </span>
                      )}
                    </div>
                    <p className="text-caption text-on-surface-variant">
                      전체 {d.totalAssets.toLocaleString()}건 · 부서 {d.depts.length}개 · 확인 {d.confirmed.toLocaleString()}
                      {d.unsurveyed > 0 && <> · <span className="text-error">미확인 {d.unsurveyed.toLocaleString()}</span></>}
                      {d.offMaster > 0 && <> · 마스터 밖 {d.offMaster.toLocaleString()}</>}
                    </p>
                    <ProgressBar done={d.surveyed} total={d.totalAssets} />
                  </div>
                </button>

                {open && (
                  <div className="space-y-2 border-t border-outline-variant/60 px-3 py-2.5">
                    <p className="text-caption font-medium text-on-surface-variant">설치부서별 ({d.depts.length})</p>
                    {d.depts.map((dept) => (
                      <DeptCoverageRow key={dept.dept} datasetId={d.datasetId} dept={dept} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* 조사 세션 요약 */}
          {sessions.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-outline-variant">
              <p className="text-caption font-medium text-on-surface-variant">조사 세션 ({sessions.length})</p>
              {sessions.map((x) => {
                const pct = x.total > 0 ? Math.round((x.confirmed / x.total) * 100) : 0
                return (
                  <div key={x.id} className="space-y-1.5 rounded-xl border border-outline-variant bg-surface-container-low p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-body-sm font-medium text-on-surface">{x.name}</span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${x.completed ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>
                        {x.completed ? '완료' : '진행중'}
                      </span>
                    </div>
                    <p className="text-caption text-on-surface-variant">{x.parentDept} · {x.dept || '-'} · {x.createdAt.slice(0, 10)}</p>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-outline-variant">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="shrink-0 text-caption text-on-surface-variant">{x.confirmed}/{x.total} ({pct}%)</span>
                    </div>
                    {x.abnormal > 0 && <p className="text-caption text-error">이상 {x.abnormal}건</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────── Pairing Manager (admin) ─────────────────── */

/**
 * 앱 설치 QR + 기기 관리 패널
 *
 * QR을 찍으면 /inventory 로 이동 → 이름 입력 + 배부된 본부 선택 → 재물조사 시작
 *
 * URL 우선순위:
 *   1. VITE_PUBLIC_URL 환경변수 (배포/외부 접근 시)
 *   2. window.location.origin (같은 네트워크 LAN 접근 시)
 */
function InstallQrCard() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [qrUrl, setQrUrl] = useState('')
  const [copied, setCopied] = useState(false)

  // user 화면의 QR과 완전히 같은 주소를 씁니다 (inventoryInstallUrl 한 곳에서 계산)
  const inventoryUrl = inventoryInstallUrl()

  useEffect(() => {
    setQrUrl(inventoryUrl)
    import('qrcode').then(({ default: QRCode }) => {
      if (!canvasRef.current) return
      QRCode.toCanvas(canvasRef.current, inventoryUrl, {
        width: 220,
        margin: 2,
        color: { dark: '#1f2328', light: '#ffffff' },
      }).catch(() => {})
    })
  }, [inventoryUrl])

  const copyUrl = () => {
    navigator.clipboard.writeText(qrUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const downloadQr = () => {
    if (!canvasRef.current) return
    const a = document.createElement('a')
    a.download = '재물조사_앱설치_QR.png'
    a.href = canvasRef.current.toDataURL('image/png')
    a.click()
  }

  const isLan = !isExternalInstallUrl()
  const sameNetworkNote = isLan
    ? '⚠️ 현재 LAN 주소 — 같은 네트워크에서만 접근 가능합니다. 외부에서 쓰려면 start-ngrok-tunnel.ps1 로 터널을 열거나 VITE_PUBLIC_URL을 설정하세요.'
    : '✅ 외부 접속 주소 — user 화면의 QR과 같은 주소입니다.'

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Icon name="install_mobile" className="text-primary text-[20px]" />
        <p className="text-body-sm font-semibold text-on-surface">📱 핸드폰 앱 설치 QR</p>
      </div>

      {/* QR 캔버스 */}
      <div className="flex justify-center">
        <div className="rounded-xl border-2 border-outline-variant p-2 bg-white inline-block">
          <canvas ref={canvasRef} className="block" />
        </div>
      </div>

      {/* URL + 복사 */}
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[11px] font-mono bg-surface-container-high rounded-lg px-2 py-1.5 break-all text-on-surface-variant">
          {inventoryUrl}
        </p>
        <button type="button" onClick={copyUrl}
          className="no-drag shrink-0 rounded-lg border border-outline-variant px-2 py-1.5 text-[11px] hover:bg-surface-container-high flex items-center gap-1">
          <Icon name={copied ? 'check' : 'content_copy'} className="text-[14px]" />
          {copied ? '복사됨' : '복사'}
        </button>
        <button type="button" onClick={downloadQr}
          className="no-drag shrink-0 rounded-lg border border-outline-variant px-2 py-1.5 text-[11px] hover:bg-surface-container-high flex items-center gap-1">
          <Icon name="download" className="text-[14px]" />QR
        </button>
      </div>

      {/* 네트워크 안내 */}
      <p className={`text-[10px] leading-relaxed rounded-lg px-2.5 py-2 ${
        isLan
          ? 'bg-warning/10 text-warning border border-warning/30'
          : 'bg-success/10 text-success border border-success/30'
      }`}>
        {sameNetworkNote}
      </p>

      {/* 설치 방법 */}
      <div className="rounded-xl bg-surface-container p-3 space-y-1.5 text-[11px] text-on-surface-variant">
        <p className="font-semibold text-on-surface">설치 방법</p>
        <div className="flex items-start gap-1.5">
          <span className="shrink-0 w-4 h-4 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center">1</span>
          <span>위 QR을 스마트폰 카메라로 촬영하거나 URL을 직접 입력</span>
        </div>
        <div className="flex items-start gap-1.5">
          <span className="shrink-0 w-4 h-4 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center">2</span>
          <span><strong>Android:</strong> Chrome 메뉴(⋮) → &quot;홈 화면에 추가&quot;</span>
        </div>
        <div className="flex items-start gap-1.5">
          <span className="shrink-0 w-4 h-4 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center">3</span>
          <span><strong>iPhone:</strong> Safari 공유(□↑) → &quot;홈 화면에 추가&quot;</span>
        </div>
        <div className="flex items-start gap-1.5">
          <span className="shrink-0 w-4 h-4 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center">4</span>
          <span>설치 후 앱 실행 → 이름 입력 + 배부된 본부 선택 → 재물조사 시작</span>
        </div>
      </div>
    </div>
  )
}

function PairingManager() {
  const [devices, setDevices] = useState<DevicePair[]>([])
  const [busy, setBusy] = useState(true)
  const [confirmCode, setConfirmCode] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const load = () => {
    setBusy(true)
    fetchPairedDevices().then((d) => { setDevices(d); setBusy(false) })
  }

  useEffect(() => { load() }, [])

  const handleConfirm = async (action: 'approve' | 'reject') => {
    if (!confirmCode.trim()) { flash('6자리 코드를 입력하세요.'); return }
    setConfirming(true)
    const res = await confirmPairCode(confirmCode.trim(), action)
    setConfirming(false)
    if (res.ok) {
      flash(action === 'approve' ? '✅ 기기를 승인했습니다.' : '❌ 기기를 거부했습니다.')
      setConfirmCode('')
      load()
    } else {
      flash(`오류: ${res.error}`)
    }
  }

  const statusBadge = (s: DevicePair['status']) => {
    if (s === 'approved') return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-success/15 text-success">승인됨</span>
    if (s === 'rejected') return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-error/15 text-error">거부됨</span>
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-warning/15 text-warning">대기중</span>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-h3 text-h3 text-on-surface">기기 관리</h3>
        <button type="button" onClick={load}
          className="no-drag inline-flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1.5 text-label hover:bg-surface-container-high">
          <Icon name="refresh" className="text-[16px]" />새로고침
        </button>
      </div>

      {/* ★ 앱 설치 QR */}
      <InstallQrCard />

      {/* 코드 입력 승인 (선택적 페어링 흐름) */}
      <details className="rounded-xl border border-outline-variant overflow-hidden">
        <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none bg-surface-container-low hover:bg-surface-container-high">
          <Icon name="key" className="text-[16px] text-on-surface-variant" />
          <span className="text-body-sm font-medium text-on-surface flex-1">수동 페어링 코드 승인</span>
          <Icon name="expand_more" className="text-[16px] text-on-surface-variant" />
        </summary>
        <div className="px-3 pb-3 pt-2 space-y-2 bg-surface-container-lowest border-t border-outline-variant/50">
          <p className="text-[11px] text-on-surface-variant">
            /pair 페이지에서 발급된 6자리 코드를 입력해 기기를 수동 승인합니다.
          </p>
          <div className="flex gap-2">
            <input
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="no-drag flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm font-mono tracking-widest outline-none focus:border-primary text-center"
              placeholder="123456"
              maxLength={6}
            />
            <button type="button" onClick={() => void handleConfirm('approve')} disabled={confirming || confirmCode.length !== 6}
              className="no-drag rounded-lg bg-success text-on-success px-3 py-2 text-body-sm font-medium disabled:opacity-60 hover:bg-success/90">
              승인
            </button>
            <button type="button" onClick={() => void handleConfirm('reject')} disabled={confirming || confirmCode.length !== 6}
              className="no-drag rounded-lg bg-error text-on-error px-3 py-2 text-body-sm font-medium disabled:opacity-60 hover:bg-error/90">
              거부
            </button>
          </div>
        </div>
      </details>

      {/* 기기 목록 */}
      <div className="space-y-2">
        <p className="text-body-sm font-medium text-on-surface">조사 참여 기기 ({devices.length})</p>
        {busy && <div className="flex items-center gap-2 text-on-surface-variant text-body-sm py-4 justify-center"><Icon name="progress_activity" className="animate-spin" />불러오는 중...</div>}
        {!busy && devices.length === 0 && (
          <div className="rounded-xl border border-dashed border-outline-variant p-4 text-center text-caption text-on-surface-variant">
            아직 연결된 기기가 없습니다.<br />위 QR을 스캔해 앱을 설치하세요.
          </div>
        )}
        {devices.map((d) => (
          <div key={d.id} className="rounded-xl border border-outline-variant bg-surface-container-low p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon name="smartphone" className="text-[16px] text-on-surface-variant shrink-0" />
                <span className="text-body-sm font-medium text-on-surface truncate">{d.deviceName}</span>
              </div>
              {statusBadge(d.status)}
            </div>
            <p className="text-caption text-on-surface-variant">{d.userName} · {d.department || '부서 미지정'}</p>
            {d.approvedAt && (
              <p className="text-[10px] text-on-surface-variant">승인: {d.approvedAt.slice(0, 10)}</p>
            )}
          </div>
        ))}
      </div>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] rounded-full bg-on-surface text-surface px-4 py-2 text-body-sm shadow-lg">{toast}</div>
      )}
    </div>
  )
}
