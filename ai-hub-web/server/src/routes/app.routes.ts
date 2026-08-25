import { Router } from 'express'
import multer from 'multer'
import { listPublishedAppIds, setPublishedApp } from '../lib/publishedAppStore'
import { authenticate, authorize } from '../middleware/auth'
import {
  listRemoteApps,
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
// 관리자가 올린 앱 번들을 허브가 실행 중에 내려받아 등록한다.
router.get('/remote', authenticate, (req, res) => void listRemoteApps(req as any, res))
router.get('/remote/:id/bundle', authenticate, (req, res) => void getRemoteAppBundle(req as any, res))
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
