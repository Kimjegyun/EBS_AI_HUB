import { portalIdentityFetch } from '../lib/portalIdentityTransport'
import { verifyPortalMembership } from '../lib/portalMembership'
﻿import { Request, Response } from 'express'
import { AuthService } from '../services/auth.service'
import { secretsEqual } from '../lib/timingSafe'

const authService = new AuthService()

function getAdminAccessCode(): string | null {
  const configured = process.env.ADMIN_ACCESS_CODE?.trim()
  if (!configured) return null
  return configured
}

export class AuthController {
  async portalConfig(_req: Request, res: Response) {
    const url = process.env.SUPABASE_URL?.trim()
    const anonKey = process.env.SUPABASE_ANON_KEY?.trim()
    if (!url || !anonKey) {
      res.status(503).json({ error: 'Portal authentication is not configured.' })
      return
    }
    res.setHeader('Cache-Control', 'no-store')
    res.json({ url, anonKey })
  }

  async verifyAiHubSession(req: Request, res: Response) {
    const token = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1] || ''
    const result = await verifyPortalMembership(process.env.SUPABASE_URL?.trim() || '', process.env.SUPABASE_ANON_KEY?.trim() || '', token, portalIdentityFetch)
    res.setHeader('Cache-Control', 'no-store')
    res.status(result.status).json(result.body)
  }

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
    res.setHeader('Cache-Control', 'no-store')
    res.json({ ok: secretsEqual(expected, provided) })
  }
}
