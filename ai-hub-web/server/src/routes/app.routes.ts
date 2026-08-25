import { Router } from 'express'
import { listPublishedAppIds, setPublishedApp } from '../lib/publishedAppStore'
import { authenticate, authorize } from '../middleware/auth'

const router = Router()

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

export default router
