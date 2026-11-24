import { portalIdentityFetch } from '../lib/portalIdentityTransport'
import rateLimit from 'express-rate-limit'
import { refreshPortalSession } from '../lib/portalRefresh'
import { Router } from 'express'
import { AuthController } from '../controllers/auth.controller'
import { adminGateLimiter, loginLimiter } from '../middleware/rateLimiter'

const router = Router()
const controller = new AuthController()

router.post('/login', loginLimiter, (req, res) => void controller.login(req, res))
router.post('/signup', loginLimiter, (req, res) => void controller.signup(req, res))
router.get('/portal-config', (req, res) => void controller.portalConfig(req, res))
router.post('/verify-ai-hub-session', (req, res) => void controller.verifyAiHubSession(req, res))
router.post('/refresh-ai-hub-session', rateLimit({windowMs:60000,max:120,standardHeaders:'draft-7',legacyHeaders:false}), async (req,res) => {
  const result=await refreshPortalSession(process.env.SUPABASE_URL?.trim()||'',process.env.SUPABASE_ANON_KEY?.trim()||'',req.body,portalIdentityFetch)
  res.setHeader('Cache-Control','no-store')
  res.status(result.status).json(result.body)
})
router.post('/logout', (req, res) => void controller.logout(req, res))
router.post('/refresh', (req, res) => void controller.refreshToken(req, res))
router.post('/reset-password', adminGateLimiter, (req, res) => void controller.resetPassword(req, res))
router.post('/verify-admin-code', adminGateLimiter, (req, res) => void controller.verifyAdminCode(req, res))

export default router
