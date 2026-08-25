import { Router } from 'express'
import { appendServerIoLog, clearServerIoLog, listIoLog } from '../lib/ioLogStore'
import { authenticate, authorize } from '../middleware/auth'

const router = Router()

router.use(authenticate)

router.get('/', (_req, res) => {
  res.json({ ok: true, entries: listIoLog() })
})

router.post('/', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const entry = appendServerIoLog(body as Record<string, unknown>)
  res.json({ ok: true, entry })
})

router.delete('/', authorize('admin'), (_req, res) => {
  clearServerIoLog()
  res.json({ ok: true, entries: [] })
})

export default router
