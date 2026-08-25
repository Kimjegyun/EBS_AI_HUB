import { Router } from 'express'
import { completeWithStoredKeys } from '../services/aiProxy.service'
import { pingTencent } from '../services/tencentComplete'
import { readEnvironmentData } from '../lib/environmentStore'
import { resolveProviderConfig } from '../lib/appAiConfig'
import { authenticate } from '../middleware/auth'

const router = Router()

router.use(authenticate)

function asAppId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const id = value.trim()
  if (!id || id.length > 64 || !/^[a-z0-9][a-z0-9-]*$/i.test(id)) return undefined
  return id
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function unwrapCompleteBody(raw: unknown): Record<string, unknown> {
  const source = asRecord(raw)
  if (!source) return {}
  if (typeof source.provider === 'string' && Array.isArray(source.messages)) return source
  for (const key of ['body', 'data', 'payload', 'request']) {
    const nested = asRecord(source[key])
    if (!nested) continue
    if (typeof nested.provider === 'string' || Array.isArray(nested.messages)) return nested
  }
  return source
}

function asCompleteBody(raw: unknown): {
  provider: 'openai' | 'fal' | 'tencent' | null
  messages: unknown[] | null
  model?: string
  endpoint?: string
  appId?: string
} {
  const nested = unwrapCompleteBody(raw)
  const provider =
    nested.provider === 'fal'
      ? 'fal'
      : nested.provider === 'tencent'
        ? 'tencent'
        : nested.provider === 'openai'
          ? 'openai'
          : null
  return {
    provider,
    messages: Array.isArray(nested.messages) ? nested.messages : null,
    model: typeof nested.model === 'string' ? nested.model : undefined,
    endpoint: typeof nested.endpoint === 'string' ? nested.endpoint : undefined,
    appId: asAppId(nested.appId),
  }
}

router.post('/complete', async (req, res, next) => {
  try {
    const body = asCompleteBody(req.body)
    if (!body.provider || !body.messages) {
      res.status(400).json({
        ok: false,
        error: 'provider와 messages가 필요합니다.',
        received: {
          contentType: req.headers['content-type'] ?? null,
          keys: req.body && typeof req.body === 'object' ? Object.keys(req.body as object) : [],
        },
      })
      return
    }
    const result = await completeWithStoredKeys({
      provider: body.provider,
      messages: body.messages as Parameters<typeof completeWithStoredKeys>[0]['messages'],
      model: body.model,
      endpoint: body.endpoint,
      appId: body.appId,
    })
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
})

router.post('/tencent-test', async (_req, res, next) => {
  try {
    const env = await readEnvironmentData()
    const config = resolveProviderConfig(env, 'my-llm')
    const result = await pingTencent(config)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
})

export default router
