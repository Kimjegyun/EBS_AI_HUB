import { Router } from 'express'
import multer from 'multer'
import { authenticate, authorize } from '../middleware/auth'
import { writeEnvironmentData } from '../lib/environmentStore'
import { normalizeResourcePolicy } from '../lib/resourcePolicy'
import { readResourcePolicy, resourceActivity, resourceGuard } from '../lib/resourceExecution'
import { readWorkbook } from '../lib/safeWorkbook'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 0, parts: 1 } })
router.use(authenticate)
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
router.get('/', async (_req, res, next) => {
  try { res.json({ policy: await readResourcePolicy() }) } catch (error) { next(error) }
})
router.get('/status', authorize('admin'), async (_req, res, next) => {
  try { res.json({ policy: await readResourcePolicy(), ...resourceActivity() }) } catch (error) { next(error) }
})
router.put('/', authorize('admin'), async (req, res, next) => {
  let policy
  try { policy = normalizeResourcePolicy(req.body?.policy, true) }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return }
  try {
    await writeEnvironmentData({ resource_policy: policy })
    res.json({ policy })
  } catch (error) { next(error) }
})
router.post('/workbook', resourceGuard, (req, res, next) => {
  if (res.locals.resourcePolicy.workbookMode !== 'central') {
    res.status(409).json({ error: '사용자 PC 처리 모드입니다. 설정을 새로 불러와 주세요.' }); return
  }
  upload.single('file')(req, res, next)
}, async (req, res, next) => {
  res.locals.resourceProcessing = true
  try {
    if (!req.file) { res.status(400).json({ error: '엑셀 파일이 필요합니다.' }); return }
    res.json({ workbook: await readWorkbook(req.file.buffer) })
  } catch (error) { next(error) }
  finally { res.locals.releaseResource?.() }
})
export default router
