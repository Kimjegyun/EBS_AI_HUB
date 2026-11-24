import { Router } from 'express'
import { publicEnvironmentData, publicMemberEnvironmentData } from '../lib/secretFields'
import { readEnvironmentRow, writeEnvironmentData } from '../lib/environmentStore'
import { authenticate, authorize, type AuthRequest } from '../middleware/auth'

const router = Router()

router.get('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const row = await readEnvironmentRow()
    res.json({
      data: req.user?.role === 'admin'
        ? publicEnvironmentData(row.data)
        : publicMemberEnvironmentData(row.data),
      updated_at: row.updatedAt,
    })
  } catch (error) {
    next(error)
  }
})

router.put('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const incoming = req.body?.data && typeof req.body.data === 'object' ? req.body.data : {}
    // Resource policy has its own validated endpoint; stale general settings must not reset it.
    const { resource_policy: _resourcePolicy, ...settings } = incoming
    await writeEnvironmentData(settings)
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

export default router
