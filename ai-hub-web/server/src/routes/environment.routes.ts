import { Router } from 'express'
import { publicEnvironmentData } from '../lib/secretFields'
import { readEnvironmentRow, writeEnvironmentData } from '../lib/environmentStore'
import { authenticate, authorize } from '../middleware/auth'

const router = Router()

router.get('/', authenticate, async (_req, res, next) => {
  try {
    const row = await readEnvironmentRow()
    res.json({
      data: publicEnvironmentData(row.data),
      updated_at: row.updatedAt,
    })
  } catch (error) {
    next(error)
  }
})

router.put('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const incoming = req.body?.data && typeof req.body.data === 'object' ? req.body.data : {}
    await writeEnvironmentData(incoming)
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

export default router
