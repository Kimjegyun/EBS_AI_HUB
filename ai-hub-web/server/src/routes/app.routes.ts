import { Router } from 'express'
import multer from 'multer'
import { listPublishedAppIds, setPublishedApp } from '../lib/publishedAppStore'
import { authenticate, authorize } from '../middleware/auth'
import {
  listRemoteApps,
  listSubmissions,
  listMySubmissions,
  readVersionCode,
  submitRemoteApp,
  reviewVersion,
  suspendApp,
  resumeApp,
  uploadRemoteApp,
  getRemoteAppBundle,
  deleteRemoteApp,
  exportRemoteApp,
  importRemoteApp,
} from '../controllers/remoteApp.controller'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } })

router.get('/published', async (_req, res, next) => {
  try {
    const appIds = await listPublishedAppIds()
    res.json({ appIds })
  } catch (error) {
    next(error)
  }
})

router.put('/published/:appId', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const published = req.body?.published === true
    await setPublishedApp(req.params.appId, published)
    res.json({ ok: true, appIds: await listPublishedAppIds() })
  } catch (error) {
    next(error)
  }
})

// ── 원격 앱 (공동 마켓플레이스) ────────────────────────────────────────────
//
// 제출 → 심사 → 승인 → 배포. 승인된 버전만 사용자에게 내려간다.
// 자세한 흐름은 controllers/remoteApp.controller.ts 머리말과 doc/REMOTE_APPS.md 참고.
//
// 경로가 겹치지 않도록 고정 경로(/submit, /mine, /submissions, /versions/...)를
// :id 패턴보다 먼저 등록한다.

/** 배포 중(승인된) 앱 목록 — 허브가 이걸 보고 번들을 받아간다. */
router.get('/remote', authenticate, (req, res) => void listRemoteApps(req as any, res))

/** 사용자 제출 — 누구나 낼 수 있고, 심사를 통과해야 배포된다. */
router.post('/remote/submit', authenticate, upload.single('bundle'), (req, res) =>
  void submitRemoteApp(req as any, res),
)

/** 내가 낸 제출과 심사 결과 */
router.get('/remote/mine', authenticate, (req, res) => void listMySubmissions(req as any, res))

/** 심사 대기·이력 (관리자) */
router.get('/remote/submissions', authenticate, authorize('admin'), (req, res) =>
  void listSubmissions(req as any, res),
)

/** 심사용 코드 열람 (관리자) */
router.get('/remote/versions/:versionId/code', authenticate, authorize('admin'), (req, res) =>
  void readVersionCode(req as any, res),
)

/** 승인 / 반려 (관리자) */
router.post('/remote/versions/:versionId/review', authenticate, authorize('admin'), (req, res) =>
  void reviewVersion(req as any, res),
)

/** 배포 정지 / 해제 (관리자) — 삭제하지 않고 배포만 멈춘다. */
router.post('/remote/:id/suspend', authenticate, authorize('admin'), (req, res) =>
  void suspendApp(req as any, res),
)
router.post('/remote/:id/resume', authenticate, authorize('admin'), (req, res) =>
  void resumeApp(req as any, res),
)

/** 번들 본문 — 기본은 승인된 배포 버전, ?versionId= 는 관리자·제출자만 */
router.get('/remote/:id/bundle', authenticate, (req, res) =>
  void getRemoteAppBundle(req as any, res),
)

/** 관리자 직접 등록 — 심사를 건너뛴다 (관리자가 이미 확인한 것으로 본다). */
router.post('/remote', authenticate, authorize('admin'), upload.single('bundle'), (req, res) =>
  void uploadRemoteApp(req as any, res),
)

router.delete('/remote/:id', authenticate, authorize('admin'), (req, res) =>
  void deleteRemoteApp(req as any, res),
)

// 앱 이식 — 한 조직에서 만든 앱을 파일로 내보내 다른 조직이 그대로 가져다 쓴다.
router.get('/remote/:id/export', authenticate, (req, res) => void exportRemoteApp(req as any, res))
router.post('/remote/import', authenticate, authorize('admin'), upload.single('file'), (req, res) =>
  void importRemoteApp(req as any, res),
)

export default router
