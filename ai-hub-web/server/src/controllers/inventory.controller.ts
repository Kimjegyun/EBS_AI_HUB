// Inventory controller — handles HTTP request/response and delegates to the
// service. Keeps the controller thin (no business logic here).

import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import * as XLSX from 'xlsx'
import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execFile } from 'child_process'
import { encrypt as encryptValue, decrypt as decryptValue } from '../lib/crypto'
import { run as dbRun, get as dbGet, all as dbAll } from '../config/database'
import {
  listDatasets,
  getDatasetAssets,
  upsertDataset,
  confirmAssetInDataset,
  listSessions,
  getSession,
  createSession,
  upsertResult,
  deleteResult,
  setCompleted,
  deleteSession,
  getStats,
  registerSseClient,
  countSessionsForDataset,
  getDatasetMetaById,
  deleteDataset,
  getCoverageStats,
  getUnsurveyedAssets,
} from '../services/inventory.service'
import type { Asset } from '../services/inventory.service'

// ─── Required Excel columns → Asset field mapping ─────────────────────────────
const REQUIRED_COLS = ['자산번호', '자산명'] as const

// ERP 파일(파일2, 62컬럼) 매핑 — '명' 컬럼 우선
const ERP_COL_MAP: Record<string, keyof Asset> = {
  자산번호: 'assetNo',
  구자산번호: 'oldAssetNo',
  자산명: 'name',
  모델명: 'model',
  규격: 'spec',
  취득일자: 'acquiredAt',
  취득가액: 'acquiredPrice',
  제조번호: 'serialNo',
  설치부서명: 'dept',      // '명' 우선
  설치부서: 'deptCode',
  설치장소명: 'location',  // '명' 우선
  설치장소: 'locationCode',
  '사용자(부서)명': 'userDept', // '명' 우선
  '사용자(부서)': 'userDeptCode',
  팀세부명: 'team',
  관리부서명: 'manageDept',
  관리부서: 'manageDeptCode',
  장비구분: 'equipType',
  자산상태: 'assetStatus',
  비고: 'remark',
}

// 운영관리부 양식 시트(파일1) 매핑 — 헤더행 7번째
const SURVEY_COL_MAP: Record<string, keyof Asset> = {
  자산번호: 'assetNo',
  구자산번호: 'oldAssetNo',
  자산명: 'name',
  모델명: 'model',
  규격: 'spec',
  취득일자: 'acquiredAt',
  제조번호: 'serialNo',
  설치부서: 'dept',
  설치장소: 'location',
  '사용자(부서)': 'userDept',
  팀세부: 'team',
  관리부서: 'manageDept',
  장비구분: 'equipType',
  상위부서: 'parentDept',
  '부서확인\n(정상, 부서/위치 이동,소재불명)': 'surveyStatus',
  '비 고': 'remark',
}

// 기본 단일 업로드 매핑 (하위호환)
const COL_MAP: Record<string, keyof Asset> = {
  ...ERP_COL_MAP,
  // 설치부서 fallback (명 없는 경우)
  설치부서: 'dept',
  설치장소: 'location',
  '사용자(부서)': 'userDept',
  팀세부: 'team',
  관리부서: 'manageDept',
  상위부서: 'parentDept',
}

// ─── Datasets ────────────────────────────────────────────────────────────────

export async function getDatasets(req: AuthRequest, res: Response): Promise<void> {
  const rows = await listDatasets()
  res.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      parentDept: r.parent_dept,
      assetCount: r.asset_count,
      uploadedAt: r.uploaded_at,
      source: r.source,
    })),
  )
}

export async function getAssets(req: AuthRequest, res: Response): Promise<void> {
  const assets = await getDatasetAssets(req.params.id)
  res.json(assets)
}

export async function uploadDataset(req: AuthRequest, res: Response): Promise<void> {
  const file = (req as any).file as Express.Multer.File | undefined
  if (!file) {
    res.status(400).json({ error: '파일이 없습니다.' })
    return
  }
  const { title, parentDept, id } = req.body as Record<string, string>
  if (!title || !parentDept) {
    res.status(400).json({ error: 'title과 parentDept는 필수입니다.' })
    return
  }

  const wb = XLSX.read(file.buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })

  if (rows.length === 0) {
    res.status(400).json({ error: '엑셀 파일에 데이터가 없습니다.' })
    return
  }

  const headers = Object.keys(rows[0])
  const missing = REQUIRED_COLS.filter((c) => !headers.includes(c))
  if (missing.length > 0) {
    res.status(400).json({ error: '필수 컬럼이 없습니다.', missingColumns: missing })
    return
  }

  const assets: Asset[] = rows.map((row) => {
    const asset: Partial<Asset> = {}
    for (const [col, field] of Object.entries(COL_MAP)) {
      ;(asset as Record<string, string>)[field] = String(row[col] ?? '')
    }
    // Ensure required fields
    if (!asset.assetNo) asset.assetNo = ''
    if (!asset.name) asset.name = ''
    return asset as Asset
  })

  const result = await upsertDataset(
    id || '',
    title,
    parentDept,
    assets,
    req.user!.id,
    Buffer.from(file.originalname, 'latin1').toString('utf8'),
  )
  res.status(201).json(result)
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function getSessions(_req: AuthRequest, res: Response): Promise<void> {
  const rows = await listSessions()
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      datasetId: r.dataset_id,
      parentDept: r.parent_dept,
      dept: r.dept,
      createdBy: r.created_by,
      createdAt: r.created_at,
      completed: r.completed === 1,
      completedAt: r.completed_at,
      uploadedAt: r.uploaded_at,
      updatedAt: r.updated_at,
    })),
  )
}

export async function getSessionById(req: AuthRequest, res: Response): Promise<void> {
  const row = await getSession(req.params.id)
  if (!row) {
    res.status(404).json({ error: '세션을 찾을 수 없습니다.' })
    return
  }
  res.json({
    id: row.id,
    name: row.name,
    datasetId: row.dataset_id,
    parentDept: row.parent_dept,
    dept: row.dept,
    createdBy: row.created_by,
    createdAt: row.created_at,
    completed: row.completed === 1,
    completedAt: row.completed_at,
    uploadedAt: row.uploaded_at,
    updatedAt: row.updated_at,
    results: JSON.parse(row.results_json),
  })
}

export async function createSessionHandler(req: AuthRequest, res: Response): Promise<void> {
  const { name, datasetId, parentDept, dept } = req.body as Record<string, string>
  if (!name || !datasetId || !parentDept) {
    res.status(400).json({ error: 'name, datasetId, parentDept는 필수입니다.' })
    return
  }
  const session = await createSession(name, datasetId, parentDept, dept || '', req.user!.id)
  res.status(201).json({
    id: session.id,
    name: session.name,
    datasetId: session.dataset_id,
    parentDept: session.parent_dept,
    dept: session.dept,
    createdBy: session.created_by,
    createdAt: session.created_at,
    completed: false,
    results: {},
  })
}

export async function upsertResultHandler(req: AuthRequest, res: Response): Promise<void> {
  const { id, assetNo } = req.params
  const result = req.body as { confirmed?: boolean; verifier?: string; [k: string]: unknown }
  if (!result || !assetNo) {
    res.status(400).json({ error: '조사 결과가 없습니다.' })
    return
  }
  const out = await upsertResult(id, assetNo, result, req.user!.id)

  // 확인된 자산이면 해당 세션의 dataset(본부별 DB)에 확인 플래그 업데이트 (best-effort)
  if (result.confirmed) {
    try {
      const session = await getSession(id)
      if (session?.dataset_id) {
        const verifier = (result.verifier as string | undefined) || req.user!.email
        await confirmAssetInDataset(session.dataset_id, decodeURIComponent(assetNo), id, verifier)
      }
    } catch { /* best-effort, don't fail the main response */ }
  }

  res.json(out)
}

export async function deleteResultHandler(req: AuthRequest, res: Response): Promise<void> {
  const { id, assetNo } = req.params
  await deleteResult(id, assetNo, req.user!.id)
  res.json({ ok: true })
}

export async function completeSessionHandler(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params
  const { completed } = req.body as { completed: boolean }
  await setCompleted(id, completed)
  res.json({ ok: true })
}

export async function deleteSessionHandler(req: AuthRequest, res: Response): Promise<void> {
  await deleteSession(req.params.id)
  res.json({ ok: true })
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function statsHandler(_req: AuthRequest, res: Response): Promise<void> {
  const sessions = await getStats()
  res.json({ sessions })
}

// ─── SSE ─────────────────────────────────────────────────────────────────────

export function sseHandler(req: AuthRequest, res: Response): void {
  const { id: sessionId } = req.params

  // EventSource는 커스텀 헤더를 설정할 수 없으므로 query param 토큰을 fallback으로 허용
  // 단, JWT_SECRET이 설정되지 않은 경우 query param 인증 거부
  if (!req.user) {
    const rawToken = req.query.token as string | undefined
    if (!rawToken) { res.status(401).end(); return }

    const secret = process.env.JWT_SECRET?.trim()
    const adminCode = process.env.ADMIN_ACCESS_CODE?.trim()
    if (!secret) { res.status(401).end(); return }

    // ADMIN_ACCESS_CODE bearer 허용
    if (adminCode && rawToken === adminCode) {
      req.user = { id: 'system', email: 'system@local', role: 'admin' }
    } else {
      const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken')
      try {
        const decoded = jwt.verify(rawToken, secret) as { id: string; email: string; role: string }
        req.user = decoded
      } catch {
        res.status(401).end()
        return
      }
    }
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const write = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  write('connected', { sessionId, ts: new Date().toISOString() })

  const heartbeat = setInterval(() => {
    write('heartbeat', { ts: new Date().toISOString() })
  }, 30_000)

  const unregister = registerSseClient(sessionId, write)

  req.on('close', () => {
    clearInterval(heartbeat)
    unregister()
  })
}

// ─── Helper: parse rows from xlsx worksheet ───────────────────────────────────

function parseRows(
  buf: Buffer,
  sheetName: string | undefined,
  headerRow: number,
  colMap: Record<string, keyof Asset>,
): Asset[] {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const wsName = sheetName
    ? wb.SheetNames.find((n) => n === sheetName) ?? wb.SheetNames[0]
    : wb.SheetNames[0]
  const ws = wb.Sheets[wsName]

  // range override: shift start row to skip title/guide rows
  const ref = ws['!ref'] ?? 'A1'
  const range = XLSX.utils.decode_range(ref)
  range.s.r = headerRow - 1  // 0-based row index
  ws['!ref'] = XLSX.utils.encode_range(range)

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
    raw: false,
  })

  return rows
    .filter((row) => {
      const assetNo = String(row['자산번호'] ?? '').trim()
      return assetNo && assetNo !== '자산번호'  // skip stray header rows
    })
    .map((row) => {
      const asset: Partial<Asset> = {}
      for (const [col, field] of Object.entries(colMap)) {
        const val = String(row[col] ?? '').trim()
        if (val) (asset as Record<string, string>)[field] = val
      }
      if (!asset.assetNo) asset.assetNo = ''
      if (!asset.name) asset.name = ''
      return asset as Asset
    })
}

// ─── Merge: 운영관리부 양식(파일1) + ERP 자산현황(파일2) ──────────────────────

export async function mergeDatasets(req: AuthRequest, res: Response): Promise<void> {
  const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined
  if (!files || !files['survey_list'] || !files['erp_assets']) {
    res.status(400).json({
      error: 'survey_list(운영관리부 양식)와 erp_assets(ERP 자산현황) 파일이 모두 필요합니다.',
    })
    return
  }

  const { title, parentDept, sheetName, id } = req.body as Record<string, string>
  if (!title || !parentDept) {
    res.status(400).json({ error: 'title과 parentDept는 필수입니다.' })
    return
  }

  const surveyFile = files['survey_list'][0]
  const erpFile = files['erp_assets'][0]

  // 파일1: 운영관리부 양식 — 헤더행 7번째, 지정 시트(기본: 융합기술본부)
  const surveySheet = sheetName || '융합기술본부'
  const surveyAssets = parseRows(surveyFile.buffer, surveySheet, 7, SURVEY_COL_MAP)
  for (const a of surveyAssets) a._source = 'survey'

  // 파일2: ERP 자산현황 — 헤더행 1번째, 단일 시트
  const erpAssets = parseRows(erpFile.buffer, undefined, 1, ERP_COL_MAP)
  const erpMap = new Map(erpAssets.map((a) => [a.assetNo, a]))

  // Merge: ERP를 기준으로 survey 정보를 덮어씌움 (survey가 더 최신 현장 정보)
  const merged: Asset[] = []
  const surveyNos = new Set<string>()

  for (const sa of surveyAssets) {
    if (!sa.assetNo) continue
    surveyNos.add(sa.assetNo)
    const erp = erpMap.get(sa.assetNo)
    if (erp) {
      // ERP 기본정보 + survey 현장정보 병합
      const asset: Asset = {
        ...erp,
        // survey 필드 우선 (현장 확인 값)
        surveyStatus: sa.surveyStatus || erp.surveyStatus,
        remark: sa.remark || erp.remark,
        // survey의 dept/location은 ERP 명칭이 없을 때 사용
        dept: erp.dept || sa.dept,
        location: erp.location || sa.location,
        userDept: erp.userDept || sa.userDept,
        parentDept: sa.parentDept || erp.parentDept,
        _source: 'merged',
      }
      merged.push(asset)
    } else {
      // survey에만 있는 자산 (신규 등록됐지만 ERP 미반영)
      sa._source = 'survey'
      merged.push(sa)
    }
  }

  // ERP에만 있는 자산 추가 (survey 목록 미포함 자산)
  for (const [assetNo, ea] of erpMap) {
    if (!surveyNos.has(assetNo)) {
      ea._source = 'erp'
      merged.push(ea)
    }
  }

  if (merged.length === 0) {
    res.status(400).json({ error: '병합 결과 데이터가 없습니다. 파일을 확인하세요.' })
    return
  }

  const utf8Name = (f: Express.Multer.File) => Buffer.from(f.originalname, 'latin1').toString('utf8')
  const sourceSummary = `survey:${utf8Name(surveyFile)}|erp:${utf8Name(erpFile)}|sheet:${surveySheet}`
  const result = await upsertDataset(
    id || '',
    title,
    parentDept,
    merged,
    req.user!.id,
    sourceSummary,
  )

  // 현장 앱이 자동으로 받아 쓰도록 ERP 원본을 본부별로 보관합니다.
  await storeErpFile({
    parentDept,
    datasetId: result.id,
    buffer: erpFile.buffer,
    originalName: utf8Name(erpFile),
    uploadedBy: req.user?.id ?? null,
  })

  res.status(201).json({
    ...result,
    stats: {
      total: merged.length,
      merged: merged.filter((a) => a._source === 'merged').length,
      surveyOnly: merged.filter((a) => a._source === 'survey').length,
      erpOnly: merged.filter((a) => a._source === 'erp').length,
    },
  })
}

// ─── Survey file pre-upload ───────────────────────────────────────────────────
// 임시 저장소: uploadId → 파일 경로 (프로세스 메모리, TTL 2시간)
const surveyFileCache = new Map<string, { filePath: string; expiresAt: number; sheetNames: string[] }>()

function cleanExpiredSurveyFiles() {
  const now = Date.now()
  for (const [id, entry] of surveyFileCache) {
    if (entry.expiresAt < now) {
      fs.unlink(entry.filePath, () => {})
      surveyFileCache.delete(id)
    }
  }
}
setInterval(cleanExpiredSurveyFiles, 10 * 60 * 1000) // 10분마다 정리

/** POST /datasets/upload-survey — 운영관리부 양식을 서버에 저장 후 시트 목록 반환 */
export async function uploadSurveyFile(req: AuthRequest, res: Response): Promise<void> {
  const file = (req as any).file as Express.Multer.File | undefined
  if (!file) { res.status(400).json({ error: '파일이 없습니다.' }); return }

  // 시트 목록 파싱 (bookSheets: true → 시트 이름만 읽음, 빠름)
  let sheetNames: string[]
  try {
    const wb = XLSX.read(file.buffer, { type: 'buffer', bookSheets: true })
    sheetNames = wb.SheetNames
  } catch {
    res.status(400).json({ error: '엑셀 파일을 읽을 수 없습니다.' })
    return
  }

  // 임시 디렉터리에 파일 저장
  const uploadId = uuidv4()
  const tmpDir = path.join(os.tmpdir(), 'inventory-survey')
  fs.mkdirSync(tmpDir, { recursive: true })
  const filePath = path.join(tmpDir, `${uploadId}.xlsx`)
  fs.writeFileSync(filePath, file.buffer)

  surveyFileCache.set(uploadId, {
    filePath,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000, // 2시간
    sheetNames,
  })

  res.json({ uploadId, sheetNames, fileName: Buffer.from(file.originalname, 'latin1').toString('utf8') })
}

/** POST /datasets/merge-by-id — uploadId + sheetName + ERP파일만 전송해 병합 */
export async function mergeByUploadId(req: AuthRequest, res: Response): Promise<void> {
  const file = (req as any).file as Express.Multer.File | undefined
  if (!file) { res.status(400).json({ error: 'ERP 파일이 없습니다.' }); return }

  const { uploadId, sheetName, title, parentDept, id } = req.body as Record<string, string>
  if (!uploadId || !sheetName || !title || !parentDept) {
    res.status(400).json({ error: 'uploadId, sheetName, title, parentDept는 필수입니다.' })
    return
  }

  // uploadId는 두 곳에서 옵니다.
  //  1) /datasets/upload-survey 가 만든 메모리 캐시 (2시간, 서버 재시작 시 소멸)
  //  2) /datasets/survey-form 이 만든 영속 보관본 (재시작·새로고침 후에도 유지)
  const cached = surveyFileCache.get(uploadId)
  const surveyPath = cached?.filePath ?? (await resolveStoredSurveyForm(uploadId))
  if (!surveyPath) {
    res.status(404).json({ error: '업로드된 운영관리부 양식을 찾을 수 없습니다. 양식을 다시 업로드하세요.' })
    return
  }

  // 운영관리부 파일을 디스크에서 읽기
  let surveyBuffer: Buffer
  try {
    surveyBuffer = fs.readFileSync(surveyPath)
  } catch {
    res.status(500).json({ error: '서버에 보관된 운영관리부 양식을 읽을 수 없습니다.' })
    return
  }

  // 병합 실행
  const surveyAssets = parseRows(surveyBuffer, sheetName, 7, SURVEY_COL_MAP)
  for (const a of surveyAssets) a._source = 'survey'

  const erpAssets = parseRows(file.buffer, undefined, 1, ERP_COL_MAP)
  const erpMap = new Map(erpAssets.map((a) => [a.assetNo, a]))

  const merged: Asset[] = []
  const surveyNos = new Set<string>()

  for (const sa of surveyAssets) {
    if (!sa.assetNo) continue
    surveyNos.add(sa.assetNo)
    const erp = erpMap.get(sa.assetNo)
    if (erp) {
      merged.push({
        ...erp,
        surveyStatus: sa.surveyStatus || erp.surveyStatus,
        remark: sa.remark || erp.remark,
        dept: erp.dept || sa.dept,
        location: erp.location || sa.location,
        userDept: erp.userDept || sa.userDept,
        parentDept: sa.parentDept || erp.parentDept,
        _source: 'merged',
      })
    } else {
      sa._source = 'survey'
      merged.push(sa)
    }
  }

  for (const [assetNo, ea] of erpMap) {
    if (!surveyNos.has(assetNo)) { ea._source = 'erp'; merged.push(ea) }
  }

  if (merged.length === 0) {
    res.status(400).json({ error: `"${sheetName}" 시트에서 자산을 찾을 수 없습니다.` })
    return
  }

  const erpOriginalName = Buffer.from(file.originalname, 'latin1').toString('utf8')
  const result = await upsertDataset(
    id || '',
    title,
    parentDept,
    merged,
    req.user!.id,
    `survey:${uploadId}|sheet:${sheetName}|erp:${erpOriginalName}`,
  )

  // 현장 앱이 자동으로 받아 쓰도록 ERP 원본을 본부별로 보관합니다.
  await storeErpFile({
    parentDept,
    datasetId: result.id,
    buffer: file.buffer,
    originalName: erpOriginalName,
    uploadedBy: req.user?.id ?? null,
  })

  res.status(201).json({
    ...result,
    stats: {
      total: merged.length,
      merged: merged.filter((a) => a._source === 'merged').length,
      surveyOnly: merged.filter((a) => a._source === 'survey').length,
      erpOnly: merged.filter((a) => a._source === 'erp').length,
    },
  })
}

// ─── Device Pairing ───────────────────────────────────────────────────────────

function generatePairCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

/** POST /pair/request — 모바일 기기가 호출, 6자리 코드 반환 */
export async function pairRequestHandler(req: AuthRequest, res: Response): Promise<void> {
  const { deviceName, userName, department } = req.body as Record<string, string>
  if (!deviceName || !userName) {
    res.status(400).json({ error: 'deviceName과 userName은 필수입니다.' })
    return
  }

  // 기존 pending 코드 재사용 (같은 기기명+사용자명 조합)
  const existing = await dbGet(
    "SELECT * FROM device_pairs WHERE device_name = ? AND user_name = ? AND status = 'pending'",
    [deviceName, userName],
  )
  if (existing) {
    res.json({ pairCode: existing.pair_code, status: existing.status })
    return
  }

  let pairCode = generatePairCode()
  // 중복 방지
  let attempt = 0
  while (await dbGet('SELECT id FROM device_pairs WHERE pair_code = ?', [pairCode])) {
    pairCode = generatePairCode()
    if (++attempt > 10) { res.status(500).json({ error: '코드 생성 실패' }); return }
  }

  const id = uuidv4()
  await dbRun(
    `INSERT INTO device_pairs (id, device_name, user_name, department, pair_code, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [id, deviceName, userName, department || '', pairCode],
  )

  res.status(201).json({ pairCode, status: 'pending' })
}

/** POST /pair/confirm — 관리자가 코드 입력해서 기기 승인/거부 */
export async function pairConfirmHandler(req: AuthRequest, res: Response): Promise<void> {
  const { pairCode, action } = req.body as { pairCode: string; action: 'approve' | 'reject' }
  if (!pairCode || !action) {
    res.status(400).json({ error: 'pairCode와 action(approve|reject)은 필수입니다.' })
    return
  }

  const device = await dbGet(
    "SELECT * FROM device_pairs WHERE pair_code = ? AND status = 'pending'",
    [pairCode],
  )
  if (!device) {
    res.status(404).json({ error: '유효하지 않은 코드입니다.' })
    return
  }

  const status = action === 'approve' ? 'approved' : 'rejected'
  await dbRun(
    `UPDATE device_pairs SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, req.user!.id, device.id],
  )

  res.json({
    id: device.id,
    deviceName: device.device_name,
    userName: device.user_name,
    status,
  })
}

/** GET /pair/devices — 관리자: 등록된 기기 목록 */
export async function pairListHandler(_req: AuthRequest, res: Response): Promise<void> {
  const rows = await dbAll(
    'SELECT id, device_name, user_name, department, pair_code, status, created_at, approved_at, last_seen_at FROM device_pairs ORDER BY created_at DESC',
  )
  res.json(
    rows.map((r) => ({
      id: r.id,
      deviceName: r.device_name,
      userName: r.user_name,
      department: r.department,
      pairCode: r.pair_code,
      status: r.status,
      createdAt: r.created_at,
      approvedAt: r.approved_at,
      lastSeenAt: r.last_seen_at,
    })),
  )
}

// 재물조사 완성 엑셀 → 결과 컬럼 매핑 (다운로드 양식 기준)
// ※ parseRows() 보다 먼저 선언해야 함
const SURVEY_RESULT_COL_MAP: Record<string, keyof Asset> = {
  자산번호: 'assetNo',
  구자산번호: 'oldAssetNo',
  자산명: 'name',
  모델명: 'model',
  규격: 'spec',
  취득일자: 'acquiredAt',
  제조번호: 'serialNo',
  설치부서: 'dept',
  설치장소: 'location',
  '사용자(부서)': 'userDept',
  팀세부: 'team',
  관리부서: 'manageDept',
  장비구분: 'equipType',
  상위부서: 'parentDept',
  '부서확인\n(정상, 부서/위치 이동,소재불명)': 'surveyStatus',
  '비 고': 'remark',
}

// ─── 본부별 자산현황 엑셀 다운로드 ────────────────────────────────────────────

const DOWNLOAD_HEADER = [
  '자산번호', '구자산번호', '자산명', '모델명', '규격', '취득일자', '제조번호',
  '설치부서', '설치장소', '사용자(부서)', '팀세부', '관리부서', '장비구분', '상위부서',
  '부서확인\n(정상, 부서/위치 이동,소재불명)', '비 고',
]

const DOWNLOAD_ASSET_FIELDS: (keyof Asset)[] = [
  'assetNo', 'oldAssetNo', 'name', 'model', 'spec', 'acquiredAt', 'serialNo',
  'dept', 'location', 'userDept', 'team', 'manageDept', 'equipType', 'parentDept',
  'surveyStatus', 'remark',
]

/** GET /datasets/:id/download — 본부별 자산현황을 재물조사 양식 xlsx로 반환 */
export async function downloadDatasetExcel(req: AuthRequest, res: Response): Promise<void> {
  const assets = await getDatasetAssets(req.params.id)
  if (!assets.length) {
    res.status(404).json({ error: '데이터셋이 없거나 비어있습니다.' })
    return
  }

  const rows = await require('../config/database').all(
    'SELECT title, parent_dept FROM inventory_datasets WHERE id = ?',
    [req.params.id],
  )
  const meta = rows[0] as { title: string; parent_dept: string } | undefined
  const title = meta?.title ?? '자산현황'
  const parentDept = meta?.parent_dept ?? ''

  // 시트 구성: 제목행 + 안내행 + 빈행 + 헤더행 + 데이터행
  const titleRow = [`${title} — 재물조사 현황`]
  const guideRow = ['※ 부서확인 컬럼에 조사 결과를 기입하고 파일을 저장 후 업로드하세요.']
  const dateRow  = [`생성일: ${new Date().toLocaleString('ko-KR')}`, '', `상위부서: ${parentDept}`]

  const dataRows = assets.map((a) =>
    DOWNLOAD_ASSET_FIELDS.map((f) => ((a as unknown) as Record<string, unknown>)[f] ?? ''),
  )

  const aoa = [titleRow, guideRow, dateRow, [], DOWNLOAD_HEADER, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = DOWNLOAD_HEADER.map((h) => ({ wch: Math.max(12, h.length + 2) }))

  // 제목행 병합
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: DOWNLOAD_HEADER.length - 1 } }]

  const wb = XLSX.utils.book_new()
  const safeSheet = parentDept.slice(0, 31) || '자산현황'
  XLSX.utils.book_append_sheet(wb, ws, safeSheet)

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const safeName = `${parentDept || title}_재물조사양식.xlsx`
  // RFC 5987 인코딩
  const encodedName = encodeURIComponent(safeName).replace(/'/g, "%27")

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`)
  res.send(buf)
}

// ─── 재물조사 완성 엑셀 → 세션 결과 일괄 업로드 ──────────────────────────────

/** POST /datasets/:id/survey-upload — 작성 완료된 재물조사 엑셀을 업로드해
 *  세션 결과로 변환 저장. 새 세션을 자동 생성하거나 sessionId를 지정 가능. */
export async function uploadSurveyResult(req: AuthRequest, res: Response): Promise<void> {
  const file = (req as any).file as Express.Multer.File | undefined
  if (!file) { res.status(400).json({ error: '파일이 없습니다.' }); return }

  const { sessionId, sessionName, dept } = req.body as Record<string, string>
  const datasetId = req.params.id

  // 데이터셋 존재 확인
  const datasetRow = await dbGet('SELECT * FROM inventory_datasets WHERE id = ?', [datasetId])
  if (!datasetRow) { res.status(404).json({ error: '데이터셋을 찾을 수 없습니다.' }); return }

  // 엑셀 파싱: 헤더행 5번째(다운로드 양식 기준: 1=제목,2=안내,3=날짜,4=빈행,5=헤더)
  const assets = parseRows(file.buffer, undefined, 5, SURVEY_RESULT_COL_MAP)
  if (!assets.length) {
    res.status(400).json({ error: '유효한 자산 데이터를 찾을 수 없습니다. 다운로드한 양식 파일인지 확인하세요.' })
    return
  }

  // 세션 가져오기 또는 생성
  let targetSessionId = sessionId
  if (!targetSessionId) {
    const name = sessionName || `${new Date().toLocaleDateString('ko-KR')} 재물조사 (${datasetRow.parent_dept})`
    const session = await createSession(name, datasetId, datasetRow.parent_dept, dept || '', req.user!.id)
    targetSessionId = session.id
  } else {
    const existing = await getSession(targetSessionId)
    if (!existing) { res.status(404).json({ error: '세션을 찾을 수 없습니다.' }); return }
  }

  // 자산 목록에서 결과 생성
  let updated = 0
  const now = new Date().toISOString()

  for (const a of assets) {
    if (!a.assetNo) continue
    const surveyStatusVal = a.surveyStatus || '정상'
    const result = {
      assetNo: a.assetNo,
      name: a.name || '',
      location: a.location || '',
      dept: a.dept || '',
      model: a.model || '',
      spec: a.spec || '',
      status: surveyStatusVal,
      stickerMissing: false,
      note: a.remark || '',
      confirmed: !!a.surveyStatus,
      verifier: req.user!.email,
      surveyedAt: now,
      matched: true,
    }
    await upsertResult(targetSessionId, a.assetNo, result, req.user!.id)
    updated++
  }

  res.status(201).json({
    ok: true,
    sessionId: targetSessionId,
    updated,
    total: assets.length,
  })
}


// ─── ngrok authtoken ──────────────────────────────────────────────────────────

const NGROK_ENV_PATH = path.resolve(process.cwd(), '..', '..', 'ngrok-token.env')

// ngrok token은 영숫자, 하이픈, 언더스코어만 허용 (shell injection 방지)
const NGROK_TOKEN_RE = /^[A-Za-z0-9_\-]{10,200}$/

/** ngrok-token.env에서 토큰을 읽어 복호화 후 반환 */
export function readNgrokToken(): string | null {
  try {
    const content = fs.readFileSync(NGROK_ENV_PATH, 'utf-8')
    const line = content.split('\n').find((l) => l.startsWith('NGROK_TOKEN='))
    if (!line) return null
    const val = line.replace('NGROK_TOKEN=', '').trim()
    return decryptValue(val)
  } catch {
    return null
  }
}

/** POST /api/inventory/ngrok-token  { token: string }
 *  관리자 전용 — ngrok authtoken을 등록하고 ngrok-token.env에 암호화 저장합니다. */
export async function ngrokTokenHandler(req: AuthRequest, res: Response): Promise<void> {
  const raw = (req.body as { token?: string }).token?.trim() ?? ''
  if (!raw) { res.status(400).json({ ok: false, error: '토큰이 비어있습니다.' }); return }
  if (!NGROK_TOKEN_RE.test(raw)) { res.status(400).json({ ok: false, error: '유효하지 않은 토큰 형식입니다.' }); return }

  // ngrok 실행 파일 경로 탐색 (WindowsApps PATH 우선)
  const NGROK_PATHS = [
    path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WindowsApps', 'ngrok.exe'),
    path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages',
      'ngrok.ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ngrok.exe'),
    'ngrok',
  ]
  const ngrokBin = NGROK_PATHS.find((p) => {
    try { return p === 'ngrok' || fs.existsSync(p) } catch { return false }
  }) ?? 'ngrok'

  await new Promise<void>((resolve, reject) => {
    execFile(ngrokBin, ['config', 'add-authtoken', raw], (err) => {
      if (err) reject(err); else resolve()
    })
  }).catch((_err: Error) => {
    res.status(500).json({ ok: false, error: 'ngrok 등록 실패' })
  })

  if (res.headersSent) return

  // ngrok-token.env 에 암호화 저장 (start-ngrok-tunnel.ps1은 readNgrokToken()으로 읽음)
  try {
    const stored = encryptValue(raw)
    fs.writeFileSync(NGROK_ENV_PATH, `NGROK_TOKEN=${stored}\n`, 'utf-8')
  } catch { /* no-op */ }

  res.json({ ok: true })
}

// ── 재물조사 산출물 파일 보관 ────────────────────────────────────────────────
//
// 현장에서 만든 두 종류의 엑셀을 서버에 모읍니다.
//   erp-inspection  : 검수 4열을 앞에 붙인 ERP 본부 파일
//   dept-comparison : 설치부서를 노랑/주황으로 칠한 운영관리부 대조 파일
// 파일 본문은 uploads/inventory 아래 디스크에 두고 DB에는 메타데이터만 둡니다.

const INVENTORY_FILE_DIR = path.join(process.cwd(), 'uploads', 'inventory')
const INVENTORY_FILE_KINDS = ['erp-inspection', 'dept-comparison'] as const
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

interface InventoryFileRow {
  id: string
  kind: string
  parent_dept: string
  session_id: string | null
  file_name: string
  stored_name: string
  size: number
  summary: string | null
  created_by: string | null
  created_at: string
}

/** POST /files — 생성된 산출물 엑셀을 서버에 보관 */
export async function uploadInventoryFile(req: AuthRequest, res: Response): Promise<void> {
  const file = (req as any).file as Express.Multer.File | undefined
  if (!file) {
    res.status(400).json({ error: '파일이 없습니다.' })
    return
  }
  const { kind, parentDept, sessionId, summary } = req.body as Record<string, string>
  if (!INVENTORY_FILE_KINDS.includes(kind as (typeof INVENTORY_FILE_KINDS)[number])) {
    res.status(400).json({ error: `알 수 없는 파일 종류: ${kind ?? '(없음)'}` })
    return
  }

  fs.mkdirSync(INVENTORY_FILE_DIR, { recursive: true })
  const id = uuidv4()
  const storedName = `${id}.xlsx`
  fs.writeFileSync(path.join(INVENTORY_FILE_DIR, storedName), file.buffer)

  // multer(busboy)는 파일명을 latin1로 디코드해서 넘겨줍니다. 한글 파일명이
  // 깨진 채 저장되지 않도록 UTF-8로 되돌립니다.
  const originalName = Buffer.from(file.originalname, "latin1").toString("utf8")

  await dbRun(
    `INSERT INTO inventory_files
       (id, kind, parent_dept, session_id, file_name, stored_name, size, summary, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, kind, (parentDept ?? '').trim(), (sessionId ?? '').trim() || null,
      originalName, storedName, file.size, (summary ?? '').trim() || null,
      req.user?.id ?? null,
    ],
  )
  res.json({ ok: true, id, fileName: originalName, size: file.size })
}

/** GET /files — 보관된 산출물 목록 (kind / parentDept 로 필터) */
export async function listInventoryFiles(req: AuthRequest, res: Response): Promise<void> {
  const { kind, parentDept } = req.query as Record<string, string | undefined>
  const where: string[] = []
  const params: unknown[] = []
  if (kind) { where.push('kind = ?'); params.push(kind) }
  if (parentDept) { where.push('parent_dept = ?'); params.push(parentDept) }
  const rows = (await dbAll(
    `SELECT id, kind, parent_dept, session_id, file_name, stored_name, size, summary, created_by, created_at
       FROM inventory_files
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC
      LIMIT 200`,
    params,
  )) as InventoryFileRow[]
  res.json(
    rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      parentDept: r.parent_dept,
      sessionId: r.session_id,
      fileName: r.file_name,
      size: r.size,
      summary: r.summary,
      createdBy: r.created_by,
      createdAt: r.created_at,
    })),
  )
}

/** GET /files/:id/download — 보관된 산출물 내려받기 */
export async function downloadInventoryFile(req: AuthRequest, res: Response): Promise<void> {
  const row = (await dbGet('SELECT * FROM inventory_files WHERE id = ?', [req.params.id])) as InventoryFileRow | undefined
  if (!row) {
    res.status(404).json({ error: '파일을 찾을 수 없습니다.' })
    return
  }
  const full = path.join(INVENTORY_FILE_DIR, row.stored_name)
  if (!fs.existsSync(full)) {
    res.status(410).json({ error: '파일 본문이 서버에 없습니다.' })
    return
  }
  res.setHeader('Content-Type', XLSX_MIME_TYPE)
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
  )
  fs.createReadStream(full).pipe(res)
}

/**
 * DELETE /datasets/:id — 자산 데이터셋 삭제 (관리자)
 *
 * 이 데이터셋을 쓰는 조사 세션이 남아 있으면 기본적으로 거부합니다.
 * 세션까지 정리할 생각이라면 ?force=true 로 다시 호출하세요.
 */
export async function deleteDatasetHandler(req: AuthRequest, res: Response): Promise<void> {
  const id = req.params.id
  const meta = await getDatasetMetaById(id)
  if (!meta) {
    res.status(404).json({ error: '데이터셋을 찾을 수 없습니다.' })
    return
  }

  const sessionCount = await countSessionsForDataset(id)
  const force = String(req.query.force ?? '') === 'true'
  if (sessionCount > 0 && !force) {
    res.status(409).json({
      error: `이 데이터셋을 사용하는 조사 세션이 ${sessionCount}건 있습니다.`,
      sessionCount,
      title: meta.title,
    })
    return
  }

  await deleteDataset(id)
  res.json({ ok: true, id, title: meta.title, assetCount: meta.assetCount, sessionCount })
}

// ── 운영관리부 전사 자산현황 양식 (영속 보관) ────────────────────────────────
//
// 예전에는 업로드한 양식이 서버 메모리 캐시(2시간)에만 있어서, 화면을 새로고침하거나
// 서버가 재시작하면 "미첨부"로 돌아가고 ERP 병합을 다시 할 수 없었습니다.
// 이제 파일을 uploads/inventory-survey 아래에 두고 DB에 메타데이터를 남깁니다.

const SURVEY_FORM_DIR = path.join(process.cwd(), 'uploads', 'inventory-survey')

interface SurveyFormRow {
  id: string
  file_name: string
  stored_name: string
  sheet_names: string
  size: number
  uploaded_by: string | null
  uploaded_at: string
}

function toSurveyFormDto(row: SurveyFormRow) {
  let sheetNames: string[] = []
  try { sheetNames = JSON.parse(row.sheet_names) as string[] } catch { sheetNames = [] }
  return {
    id: row.id,
    fileName: row.file_name,
    sheetNames,
    size: row.size,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  }
}

/** POST /datasets/survey-form — 운영관리부 전사 양식 업로드 (영속) */
export async function uploadSurveyForm(req: AuthRequest, res: Response): Promise<void> {
  const file = (req as any).file as Express.Multer.File | undefined
  if (!file) {
    res.status(400).json({ error: '파일이 없습니다.' })
    return
  }

  let sheetNames: string[]
  try {
    const wb = XLSX.read(file.buffer, { type: 'buffer', bookSheets: true })
    sheetNames = wb.SheetNames
  } catch {
    res.status(400).json({ error: '엑셀 파일을 읽을 수 없습니다.' })
    return
  }

  fs.mkdirSync(SURVEY_FORM_DIR, { recursive: true })
  const id = uuidv4()
  const storedName = `${id}.xlsx`
  fs.writeFileSync(path.join(SURVEY_FORM_DIR, storedName), file.buffer)
  // multer(busboy)가 latin1로 디코드한 파일명을 UTF-8로 되돌립니다.
  const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8')

  await dbRun(
    `INSERT INTO inventory_survey_forms (id, file_name, stored_name, sheet_names, size, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, originalName, storedName, JSON.stringify(sheetNames), file.size, req.user?.id ?? null],
  )

  res.json({ ok: true, id, fileName: originalName, sheetNames, size: file.size })
}

/** GET /datasets/survey-form — 가장 최근에 올린 전사 양식 */
export async function getLatestSurveyForm(_req: AuthRequest, res: Response): Promise<void> {
  const row = (await dbGet(
    'SELECT * FROM inventory_survey_forms ORDER BY uploaded_at DESC LIMIT 1',
  )) as SurveyFormRow | undefined
  if (!row) {
    res.json(null)
    return
  }
  // 파일 본문이 사라졌으면 첨부되지 않은 것으로 봅니다.
  if (!fs.existsSync(path.join(SURVEY_FORM_DIR, row.stored_name))) {
    res.json(null)
    return
  }
  res.json(toSurveyFormDto(row))
}

/** DELETE /datasets/survey-form/:id — 전사 양식 삭제 */
export async function deleteSurveyForm(req: AuthRequest, res: Response): Promise<void> {
  const row = (await dbGet('SELECT * FROM inventory_survey_forms WHERE id = ?', [
    req.params.id,
  ])) as SurveyFormRow | undefined
  if (!row) {
    res.status(404).json({ error: '양식을 찾을 수 없습니다.' })
    return
  }
  const full = path.join(SURVEY_FORM_DIR, row.stored_name)
  if (fs.existsSync(full)) fs.unlinkSync(full)
  await dbRun('DELETE FROM inventory_survey_forms WHERE id = ?', [row.id])
  res.json({ ok: true, id: row.id })
}

/** 영속 보관된 전사 양식의 파일 경로 (없으면 undefined) */
export async function resolveStoredSurveyForm(id: string): Promise<string | undefined> {
  const row = (await dbGet('SELECT * FROM inventory_survey_forms WHERE id = ?', [id])) as
    | SurveyFormRow
    | undefined
  if (!row) return undefined
  const full = path.join(SURVEY_FORM_DIR, row.stored_name)
  return fs.existsSync(full) ? full : undefined
}

// ── 커버리지 통계 / 미확인 자산 ──────────────────────────────────────────────

/** GET /stats/coverage — 본부 → 설치부서 → 확인자 계층 집계 */
export async function coverageStatsHandler(_req: AuthRequest, res: Response): Promise<void> {
  const datasets = await getCoverageStats()
  res.json({ datasets })
}

/** GET /stats/unsurveyed — 아직 조사되지 않은 자산 목록 */
export async function unsurveyedAssetsHandler(req: AuthRequest, res: Response): Promise<void> {
  const { datasetId, dept } = req.query as Record<string, string | undefined>
  const limit = Math.min(Math.max(Number(req.query.limit ?? 200) || 200, 1), 2000)
  const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0)
  const result = await getUnsurveyedAssets({ datasetId, dept, limit, offset })
  res.json({ ...result, limit, offset })
}

// ── 본부별 ERP 자산현황 원본 보관 ────────────────────────────────────────────
//
// 관리자가 데이터셋을 만들 때 올린 ERP 파일을 본부별로 남겨 둡니다.
// 현장 앱(폰)이 세션을 열 때 이 파일을 자동으로 받아가므로, 조사자가 폰에서
// ERP 파일을 따로 첨부할 필요가 없습니다. 검수 4열 산출물도 이 원본으로 만듭니다.

const ERP_FILE_DIR = path.join(process.cwd(), 'uploads', 'inventory-erp')

interface ErpFileRow {
  parent_dept: string
  id: string
  dataset_id: string | null
  file_name: string
  stored_name: string
  size: number
  uploaded_by: string | null
  uploaded_at: string
}

function toErpFileDto(row: ErpFileRow) {
  return {
    id: row.id,
    parentDept: row.parent_dept,
    datasetId: row.dataset_id,
    fileName: row.file_name,
    size: row.size,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  }
}

/** 병합에 쓴 ERP 원본을 본부별로 저장 (본부당 1개, 다시 올리면 교체). */
async function storeErpFile(opts: {
  parentDept: string
  datasetId: string | null
  buffer: Buffer
  originalName: string
  uploadedBy: string | null
}): Promise<void> {
  fs.mkdirSync(ERP_FILE_DIR, { recursive: true })

  // 같은 본부의 이전 파일은 지웁니다 (본부당 최신 1개만 유지)
  const prev = (await dbGet('SELECT * FROM inventory_erp_files WHERE parent_dept = ?', [
    opts.parentDept,
  ])) as ErpFileRow | undefined
  if (prev) {
    const old = path.join(ERP_FILE_DIR, prev.stored_name)
    if (fs.existsSync(old)) fs.unlinkSync(old)
  }

  const id = uuidv4()
  const storedName = `${id}.xlsx`
  fs.writeFileSync(path.join(ERP_FILE_DIR, storedName), opts.buffer)

  await dbRun(
    `INSERT INTO inventory_erp_files
       (parent_dept, id, dataset_id, file_name, stored_name, size, uploaded_by, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(parent_dept) DO UPDATE SET
       id = excluded.id,
       dataset_id = excluded.dataset_id,
       file_name = excluded.file_name,
       stored_name = excluded.stored_name,
       size = excluded.size,
       uploaded_by = excluded.uploaded_by,
       uploaded_at = CURRENT_TIMESTAMP`,
    [opts.parentDept, id, opts.datasetId, opts.originalName, storedName, opts.buffer.length, opts.uploadedBy],
  )
}

/** GET /datasets/erp-file?parentDept= — 보관된 ERP 원본 메타데이터 (없으면 null) */
export async function getErpFileMeta(req: AuthRequest, res: Response): Promise<void> {
  const parentDept = String(req.query.parentDept ?? '').trim()
  if (!parentDept) {
    const rows = (await dbAll('SELECT * FROM inventory_erp_files ORDER BY uploaded_at DESC')) as ErpFileRow[]
    res.json(rows.filter((r) => fs.existsSync(path.join(ERP_FILE_DIR, r.stored_name))).map(toErpFileDto))
    return
  }
  const row = (await dbGet('SELECT * FROM inventory_erp_files WHERE parent_dept = ?', [parentDept])) as
    | ErpFileRow
    | undefined
  if (!row || !fs.existsSync(path.join(ERP_FILE_DIR, row.stored_name))) {
    res.json(null)
    return
  }
  res.json(toErpFileDto(row))
}

/** GET /datasets/erp-file/:id/download — ERP 원본 내려받기 (현장 앱이 자동으로 호출) */
export async function downloadErpFile(req: AuthRequest, res: Response): Promise<void> {
  const row = (await dbGet('SELECT * FROM inventory_erp_files WHERE id = ?', [req.params.id])) as
    | ErpFileRow
    | undefined
  if (!row) {
    res.status(404).json({ error: 'ERP 파일을 찾을 수 없습니다.' })
    return
  }
  const full = path.join(ERP_FILE_DIR, row.stored_name)
  if (!fs.existsSync(full)) {
    res.status(410).json({ error: 'ERP 파일 본문이 서버에 없습니다.' })
    return
  }
  res.setHeader('Content-Type', XLSX_MIME_TYPE)
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`)
  fs.createReadStream(full).pipe(res)
}
