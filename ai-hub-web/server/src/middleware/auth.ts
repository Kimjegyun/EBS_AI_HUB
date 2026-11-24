import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { secretsEqual } from '../lib/timingSafe';
import { get } from '../config/database';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string; };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    // Previously public field credentials are permanently rejected, including old cached builds.
    const inventoryCode = process.env.INVENTORY_ACCESS_CODE?.trim();
    if (inventoryCode && secretsEqual(token, inventoryCode)) {
      return res.status(401).json({ error: 'Shared field credentials are retired. Sign in with an approved account.' });
    }

    const secret = process.env.JWT_SECRET?.trim();
    if (!secret || secret === 'default-secret') {
      return res.status(500).json({ error: 'JWT_SECRET is not configured' });
    }
    let decoded;
    try { decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }); }
    catch {
      const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
      const key = process.env.SUPABASE_ANON_KEY;
      if (!base || !key || new URL(base).protocol !== 'https:') throw new Error('Invalid token');
      const headers = { apikey: key, Authorization: `Bearer ${token}` };
      const userRes = await fetch(`${base}/auth/v1/user`, { headers, redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (!userRes.ok) throw new Error('Invalid token');
      const user = await userRes.json() as { id?: string; email?: string };
      const memberRes = await fetch(`${base}/rest/v1/rpc/ai_hub_get_session_v2`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}',
        redirect: 'error', signal: AbortSignal.timeout(8000),
      });
      if (!memberRes.ok) throw new Error('Membership unavailable');
      const payload = await memberRes.json();
      const member = Array.isArray(payload) ? payload[0] : payload;
      if (!user.id || member?.user_id !== user.id || member?.status !== 'approved') throw new Error('Account not approved');
      req.user = { id: user.id, email: user.email || '', role: ['admin', 'owner'].includes(member.role) ? 'admin' : 'user' };
      return next();
    }
    if (typeof decoded === 'string' || typeof decoded.id !== 'string' || !decoded.id) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    // Approval and role may have changed since this token was issued.
    const user = await get('SELECT id, email, role, status FROM users WHERE id = ?', [decoded.id]);
    if (!user || user.status !== 'approved') return res.status(401).json({ error: 'Account is not approved' });
    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
};
