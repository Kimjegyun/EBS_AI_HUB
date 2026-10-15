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
    const accessToken = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1]
    const supabaseUrl = process.env.SUPABASE_URL?.trim()
    const anonKey = process.env.SUPABASE_ANON_KEY?.trim()
    if (!accessToken) {
      res.status(401).json({ approved: false, error: 'Authentication required.' })
      return
    }
    if (!supabaseUrl || !anonKey) {
      res.status(503).json({ approved: false, error: 'Portal authentication is not configured.' })
      return
    }

    try {
      const baseUrl = new URL(supabaseUrl)
      if (baseUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(baseUrl.hostname)) {
        res.status(503).json({ approved: false, error: 'Portal authentication is not configured.' })
        return
      }
      const headers = { apikey: anonKey, Authorization: `Bearer ${accessToken}` }
      const userResponse = await fetch(new URL('/auth/v1/user', baseUrl), {
        headers,
        signal: AbortSignal.timeout(8_000),
      })
      if (!userResponse.ok) {
        res.status(401).json({ approved: false, error: 'Authentication required.' })
        return
      }
      const authenticatedUser: unknown = await userResponse.json()
      const userId = authenticatedUser && typeof authenticatedUser === 'object' && 'id' in authenticatedUser
        ? (authenticatedUser as { id?: unknown }).id
        : undefined
      if (typeof userId !== 'string' || !userId.trim()) {
        res.status(503).json({ approved: false, error: 'Authenticated user identity is unavailable.' })
        return
      }

      const membershipResponse = await fetch(new URL('/rest/v1/rpc/ai_hub_get_session_v2', baseUrl), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(8_000),
      })
      if (!membershipResponse.ok) {
        res.status(503).json({ approved: false, error: 'Membership verification is unavailable.' })
        return
      }

      const membership: unknown = await membershipResponse.json()
      const row = Array.isArray(membership) ? membership[0] : membership
      const status = row && typeof row === 'object' && 'status' in row
        ? (row as { status?: unknown }).status
        : undefined
      res.setHeader('Cache-Control', 'no-store')
      if (status !== 'approved') {
        res.status(403).json({ approved: false, error: 'Approved membership required.' })
        return
      }
      // role lets portal apps (e.g. ACAP) gate admin-only actions such as sharing a Drive connection.
      const role = (row as { role?: unknown }).role
      res.json({ approved: true, userId, role: typeof role === 'string' ? role : 'user' })
    } catch {
      res.status(503).json({ approved: false, error: 'Membership verification is unavailable.' })
    }
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
    res.json({ ok: secretsEqual(expected, provided) })
  }
}
