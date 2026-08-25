import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Error:', { message: err.message, stack: err.stack });
  const isProd = process.env.NODE_ENV === 'production';
  const message = isProd ? (err.statusCode < 500 ? err.message : 'Internal Server Error') : (err.message || 'Internal Server Error');
  res.status(err.statusCode || 500).json({ error: message });
};
