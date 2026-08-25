import { Router } from 'express'
import multer from 'multer'
import { authenticate, authorize } from '../middleware/auth'
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
  deleteSurveyForm,
  coverageStatsHandler,
  unsurveyedAssetsHandler,
  getErpFileMeta,
  downloadErpFile,
} from '../controllers/inventory.controller'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

// Public routes (no auth required) — must be registered BEFORE authenticate middleware
router.post('/pair/request', (req, res) => void pairRequestHandler(req as any, res))

// All other inventory routes require authentication
router.use(authenticate)

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
router.delete('/sessions/:id/results/:assetNo', (req, res) => void deleteResultHandler(req as any, res))
router.put('/sessions/:id/complete', (req, res) => void completeSessionHandler(req as any, res))
router.delete('/sessions/:id', (req, res) => void deleteSessionHandler(req as any, res))

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
