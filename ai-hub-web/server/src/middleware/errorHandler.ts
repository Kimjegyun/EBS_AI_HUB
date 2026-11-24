import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Error:', { message: err.message, stack: err.stack });
  const isProd = process.env.NODE_ENV === 'production';
  const uploadError = err.name === 'MulterError';
  const candidate = err.statusCode || err.status || (uploadError ? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400) : undefined);
  const status = Number.isInteger(candidate) && candidate >= 400 && candidate < 600 ? candidate : 500;
  const message = uploadError
    ? (err.code === 'LIMIT_FILE_SIZE' ? '파일 업로드 허용 크기를 초과했습니다. 처리 위치 설정을 확인하고 다시 실행해 주세요.' : '업로드 파일 또는 입력 항목 수가 허용 범위를 초과했습니다.')
    : isProd ? (status < 500 ? 'Request could not be processed' : 'Internal Server Error') : (err.message || 'Internal Server Error');
  if (res.headersSent) return next(err);
  res.status(status).json({ error: message });
};
