import { Router } from 'express'
import { authenticate, authorize, AuthRequest } from '../middleware/auth'
import { listUtilities, publishUtility, utilityHistory } from '../lib/utilityStore'

const router = Router()
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
router.get('/', async (_req, res, next) => {
  try { res.json(await listUtilities()) } catch (e) { next(e) }
})
router.get('/:slug', async (req, res, next) => {
  try {
    const rows = await utilityHistory(req.params.slug)
    if (!rows.length) { res.status(404).json({ error: '등록된 유틸리티가 없습니다.' }); return }
    res.json(rows)
  } catch (e) { next(e) }
})
router.post('/', authenticate, authorize('admin'), async (req: AuthRequest, res, next) => {
  try {
    res.status(201).json(await publishUtility(req.body ?? {}, req.user!.id))
  } catch (e) {
    if (e instanceof Error && !('code' in e)) { res.status(400).json({ error: e.message }); return }
    if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT') { res.status(409).json({ error: '이미 발행된 버전입니다.' }); return }
    next(e)
  }
})
export default router
