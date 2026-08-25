import { Router } from 'express'
import { AuthController } from '../controllers/auth.controller'
import { adminGateLimiter, loginLimiter } from '../middleware/rateLimiter'

const router = Router()
const controller = new AuthController()

router.post('/login', loginLimiter, (req, res) => void controller.login(req, res))
router.post('/signup', loginLimiter, (req, res) => void controller.signup(req, res))
router.post('/logout', (req, res) => void controller.logout(req, res))
router.post('/refresh', (req, res) => void controller.refreshToken(req, res))
router.post('/reset-password', adminGateLimiter, (req, res) => void controller.resetPassword(req, res))
router.post('/verify-admin-code', adminGateLimiter, (req, res) => void controller.verifyAdminCode(req, res))

export default router
