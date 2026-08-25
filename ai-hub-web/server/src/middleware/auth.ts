import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { secretsEqual } from '../lib/timingSafe';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string; };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    // Allow ADMIN_ACCESS_CODE as a shared bearer token (used by inventory app)
    const adminCode = process.env.ADMIN_ACCESS_CODE?.trim();
    if (adminCode && secretsEqual(token, adminCode)) {
      req.user = { id: 'system', email: 'system@local', role: 'admin' };
      return next();
    }

    const secret = process.env.JWT_SECRET?.trim();
    if (!secret || secret === 'default-secret') {
      return res.status(500).json({ error: 'JWT_SECRET is not configured' });
    }
    const decoded = jwt.verify(token, secret) as { id: string; email: string; role: string };
    req.user = decoded;
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
