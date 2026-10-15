import { Router } from 'express'
import multer from 'multer'
import { authenticate, authorize } from '../middleware/auth'
import { submitConfirmed, submissionStatus, workingMaster, currentSubmission, exportConfirmedResults, buildCompanyWorkbook } from '../services/inventorySubmission'
import ExcelJS from 'exceljs'
import { listMasterFiles, purgeMasterFile } from '../services/inventoryMasterFiles'
import {
  getDatasets,
  getAssets,
  uploadDataset,
  mergeDatasets,
  uploadSurveyFile,
  mergeByUploadId,
  downloadDatasetExcel,
  uploadSurveyResult,
  getSessions,
  getSessionById,
  createSessionHandler,
  upsertResultHandler,
  deleteResultHandler,
  completeSessionHandler,
  deleteSessionHandler,
  statsHandler,
  sseHandler,
  pairRequestHandler,
  pairConfirmHandler,
  pairListHandler,
  ngrokTokenHandler,
  readNgrokToken,
  uploadInventoryFile,
  listInventoryFiles,
  downloadInventoryFile,
  deleteDatasetHandler,
  uploadSurveyForm,
  getLatestSurveyForm,
  downloadSurveyForm,
  deleteSurveyForm,
  coverageStatsHandler,
  unsurveyedAssetsHandler,
  getErpFileMeta,
  downloadErpFile,
  uploadSurveyPhoto,
} from '../controllers/inventory.controller'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

// Public routes (no auth required) — must be registered BEFORE authenticate middleware
router.post('/pair/request', (req, res) => void pairRequestHandler(req as any, res))

// All other inventory routes require authentication
router.use(authenticate)
router.get('/results/export', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try { res.json({ rows: await exportConfirmedResults(String(req.query.year || new Date().getFullYear())) }) }
  catch (error) { res.status(409).json({ error: (error as Error).message }) }
})
// Every inventory deletion is restricted, including session/result deletion.
router.use((req, res, next) => {
  if (req.method === 'DELETE') return authorize('admin')(req, res, next)
  next()
})
router.get('/submission/current', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try { res.json(await currentSubmission(String(req.query.year || new Date().getFullYear()))) }
  catch (error) { res.status(409).json({ error: (error as Error).message }) }
})
// 전사 재물조사 엑셀 (모든 본부 시트) — admin only.
router.get('/submission/company-workbook', authorize('admin'), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const built = await buildCompanyWorkbook(String(req.query.year || new Date().getFullYear()))
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(built.fileName)}`)
    res.setHeader('X-Confirmed-Count', String(built.confirmed))
    res.setHeader('X-Headquarters-Count', String(built.headquarters))
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(built.buffer)
  } catch (error) { res.status(409).json({ error: (error as Error).message }) }
})
router.get('/events', authorize('admin'), (req, res) => {
  req.params.id = '*'
  sseHandler(req as any, res)
})
router.get('/master-files', authorize('admin'), async (_req, res) => {
  try { res.json(await listMasterFiles()) } catch (error) { res.status(500).json({ error: (error as Error).message }) }
})
router.get('/master-files/:id', authorize('admin'), async (req, res) => {
  try { res.json((await listMasterFiles(req.params.id))[0]) } catch (error) { res.status(404).json({ error: (error as Error).message }) }
})
router.delete('/master-files/:id', authorize('admin'), async (req, res) => {
  try { res.json(await purgeMasterFile(req.params.id, req.body.token)) } catch (error) { res.status(409).json({ error: (error as Error).message }) }
})
router.post('/sessions/:id/submit', async (req, res) => {
  if (!Array.isArray(req.body.results) || req.body.results.length > 2000) { res.status(400).json({ error: '확인 결과는 한 번에 2,000건까지 전송할 수 있습니다.' }); return }
  try { res.json(await submitConfirmed(req.params.id, req.body.results, (req as any).user.id)) }
  catch (error) { res.status(409).json({ error: (error as Error).message }) }
})
router.get('/sessions/:id/submission', async (req, res) => {
  try { res.json(await submissionStatus(req.params.id)) }
  catch (error) { res.status(409).json({ error: (error as Error).message }) }
})
router.get('/sessions/:id/master', async (req, res) => {
  try {
    const { buffer, session, masterId } = await workingMaster(req.params.id)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as any)
    const target = workbook.worksheets.find(sheet => sheet.name.trim() === session.parent_dept.trim())
    if (!target) throw new Error('마스터에서 본부 시트를 찾을 수 없습니다.')
    for (const sheet of [...workbook.worksheets]) if (sheet.id !== target.id) workbook.removeWorksheet(sheet.id)
    // Preserve row positions and original formatting; non-target departments are hidden.
    let header = 0, deptCol = 0
    for (let r = 1; r <= Math.min(target.rowCount, 30); r++) target.getRow(r).eachCell(cell => {
      if (cell.value != null && cell.text.replace(/\s/g, '') === '설치부서' && !deptCol) { header = r; deptCol = Number(cell.col) }
    })
    const results = JSON.parse(session.results_json)
    const keys = new Set(Object.keys(results).map(value => value.replace(/[^a-z0-9]/gi, '').toUpperCase()))
    if (deptCol && session.dept) for (let r = header + 1; r <= target.rowCount; r++) {
      const row = target.getRow(r)
      const dept = row.getCell(deptCol).value == null ? '' : row.getCell(deptCol).text.trim()
      let hasResult = false
      row.eachCell(cell => { if (cell.value != null && keys.has(cell.text.replace(/[^a-z0-9]/gi, '').toUpperCase())) hasResult = true })
      if (dept !== session.dept.trim() && !hasResult) row.hidden = true
    }
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Master-Version', masterId)
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(await workbook.xlsx.writeBuffer()))
  } catch (error) { res.status(409).json({ error: (error as Error).message }) }
})

// PUT keeps autosave idempotent; older servers return 404 instead of appending
// duplicate files through the legacy POST /files endpoint.
router.put('/sessions/:id/workbook', upload.single('file'), (req, res) => {
  req.body.kind = 'erp-inspection'
  req.body.sessionId = req.params.id
  void uploadInventoryFile(req as any, res)
})

// ── 재물조사 산출물 파일 (검수 반영 ERP / 설치부서 대조) ─────────────────────
router.post("/files", upload.single("file"), (req, res) => void uploadInventoryFile(req as any, res))
router.get("/files", (req, res) => void listInventoryFiles(req as any, res))
router.get("/files/:id/download", (req, res) => void downloadInventoryFile(req as any, res))

// ── Datasets ──────────────────────────────────────────────────────────────────
router.get('/datasets', (req, res) => void getDatasets(req as any, res))
router.get('/datasets/:id/assets', (req, res) => void getAssets(req as any, res))
// 본부별 자산현황 엑셀 다운로드 (재물조사 양식 포함)
router.get('/datasets/:id/download', (req, res) => void downloadDatasetExcel(req as any, res))
router.post('/datasets', authorize('admin'), upload.single('file'), (req, res) =>
  void uploadDataset(req as any, res),
)
// 2파일 병합 업로드: survey_list + erp_assets
router.post(
  '/datasets/merge',
  authorize('admin'),
  upload.fields([
    { name: 'survey_list', maxCount: 1 },
    { name: 'erp_assets', maxCount: 1 },
  ]),
  (req, res) => void mergeDatasets(req as any, res),
)
// 운영관리부 전사 양식 — 영속 보관 (새로고침·서버 재시작 후에도 유지)
router.post(
  '/datasets/survey-form',
  authorize('admin'),
  upload.single('survey_list'),
  (req, res) => void uploadSurveyForm(req as any, res),
)
router.get('/datasets/survey-form', (req, res) => void getLatestSurveyForm(req as any, res))
router.get('/datasets/survey-form/:id/download', authorize('admin'), (req, res) => void downloadSurveyForm(req as any, res))
// 본부별 ERP 자산현황 원본 — 현장 앱이 자동으로 받아 씁니다.
router.get('/datasets/erp-file', (req, res) => void getErpFileMeta(req as any, res))
router.get('/datasets/erp-file/:id/download', (req, res) => void downloadErpFile(req as any, res))
router.delete('/datasets/survey-form/:id', authorize('admin'), (req, res) =>
  void deleteSurveyForm(req as any, res),
)

// Step1: 운영관리부 양식 서버 임시 저장 → uploadId + 시트 목록 반환
router.post(
  '/datasets/upload-survey',
  authorize('admin'),
  upload.single('survey_list'),
  (req, res) => void uploadSurveyFile(req as any, res),
)
// Step2: uploadId + ERP 파일 → 병합 업로드
router.post(
  '/datasets/merge-by-id',
  authorize('admin'),
  upload.single('erp_assets'),
  (req, res) => void mergeByUploadId(req as any, res),
)
// 데이터셋 삭제 (세션이 남아 있으면 409 — ?force=true 로 강제 삭제)
router.delete('/datasets/:id', authorize('admin'), (req, res) => void deleteDatasetHandler(req as any, res))
// 완성된 재물조사 엑셀 → 세션 결과 일괄 업로드
router.post(
  '/datasets/:id/survey-upload',
  authorize('admin'),
  upload.single('survey_result'),
  (req, res) => void uploadSurveyResult(req as any, res),
)

// ── Sessions ──────────────────────────────────────────────────────────────────
router.get('/sessions', (req, res) => void getSessions(req as any, res))
router.get('/sessions/:id', (req, res) => void getSessionById(req as any, res))
router.post('/sessions', (req, res) => void createSessionHandler(req as any, res))
router.put('/sessions/:id/results/:assetNo', (req, res) => void upsertResultHandler(req as any, res))
router.post('/sessions/:id/results/:assetNo/photo', upload.single('file'), (req, res) =>
  void uploadSurveyPhoto(req as any, res),
)
router.delete('/sessions/:id/results/:assetNo', (req, res) => {
  if (req.body?.confirmed !== true) { res.status(400).json({ error: '삭제 확인이 필요합니다.' }); return }
  void deleteResultHandler(req as any, res)
})
router.put('/sessions/:id/complete', (req, res) => void completeSessionHandler(req as any, res))
router.delete('/sessions/:id', (req, res) => {
  if (req.body?.confirmed !== true) { res.status(400).json({ error: '삭제 확인이 필요합니다.' }); return }
  void deleteSessionHandler(req as any, res)
})

// ── Stats (admin) ─────────────────────────────────────────────────────────────
// 커버리지 통계 · 미확인 자산
router.get('/stats/coverage', (req, res) => void coverageStatsHandler(req as any, res))
router.get('/stats/unsurveyed', (req, res) => void unsurveyedAssetsHandler(req as any, res))
// 통계는 조사에 참여하는 일반 사용자도 봅니다 (/sessions 와 같은 수준의 읽기 전용 집계)
router.get('/stats', (req, res) => void statsHandler(req as any, res))

// ── SSE ───────────────────────────────────────────────────────────────────────
router.get('/sessions/:id/events', (req, res) => sseHandler(req as any, res))

// ── Device Pairing (authenticated) ───────────────────────────────────────────
router.post('/pair/confirm', authorize('admin'), (req, res) => void pairConfirmHandler(req as any, res))
router.get('/pair/devices', authorize('admin'), (req, res) => void pairListHandler(req as any, res))

// ── ngrok token ───────────────────────────────────────────────────────────────
router.post('/ngrok-token', authorize('admin'), (req, res) => void ngrokTokenHandler(req as any, res))
// 서버 로컬에서만 사용: ngrok-token.env 복호화 토큰 반환 (로컬호스트 전용)
router.get('/ngrok-token', authorize('admin'), (req, res) => {
  const token = readNgrokToken()
  if (!token) { res.status(404).json({ ok: false, error: '저장된 토큰이 없습니다.' }); return }
  res.json({ ok: true, token })
})

export default router
