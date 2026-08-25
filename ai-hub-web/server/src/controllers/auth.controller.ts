import { Request, Response } from 'express'
import { AuthService } from '../services/auth.service'
import { secretsEqual } from '../lib/timingSafe'

const authService = new AuthService()

function getAdminAccessCode(): string | null {
  const configured = process.env.ADMIN_ACCESS_CODE?.trim()
  if (!configured) return null
  return configured
}

export class AuthController {
  async login(req: Request, res: Response) {
    try {
      const result = await authService.login(req.body.loginId, req.body.password)
      res.json(result)
    } catch {
      // 인증 실패 세부 사유 노출 금지 — 동일한 메시지로 고정
      res.status(401).json({ error: 'Invalid credentials' })
    }
  }

  async signup(req: Request, res: Response) {
    try {
      const result = await authService.signup(req.body)
      res.json(result)
    } catch {
      res.status(400).json({ error: 'Signup failed. Please check your input.' })
    }
  }

  async logout(_req: Request, res: Response) {
    res.json({ message: 'Logged out successfully' })
  }

  async refreshToken(_req: Request, res: Response) {
    res.json({ message: 'Token refreshed' })
  }

  async resetPassword(_req: Request, res: Response) {
    res.json({ message: 'Password reset email sent' })
  }

  async verifyAdminCode(req: Request, res: Response) {
    const expected = getAdminAccessCode()
    if (!expected) {
      res.status(503).json({ ok: false, error: 'ADMIN_ACCESS_CODE is not configured.' })
      return
    }
    const provided = typeof req.body?.code === 'string' ? req.body.code.trim() : ''
    if (!provided) {
      res.status(400).json({ ok: false, error: 'code is required.' })
      return
    }
    res.json({ ok: secretsEqual(expected, provided) })
  }
}
