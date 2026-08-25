import rateLimit from 'express-rate-limit'

export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) =>
    req.method === 'OPTIONS' ||
    req.path === '/health',
})

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Try again later.' },
})

export const adminGateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many admin code attempts. Try again later.' },
})

export const aiProxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many AI requests. Try again later.' },
})

export const tencentTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: { error: 'Token 발급 요청이 너무 많습니다. 잠시 후 다시 시도하세요.' },
})
