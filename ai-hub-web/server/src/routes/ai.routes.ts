import { Router } from 'express'
import multer from 'multer'
import { completeWithStoredKeys, summarizeWithTogether, testTogetherConnection, transcribeWithStoredKey } from '../services/aiProxy.service'
import { pingTencent } from '../services/tencentComplete'
import { readEnvironmentData } from '../lib/environmentStore'
import { resolveProviderConfig } from '../lib/appAiConfig'
import { authenticate, authorize } from '../middleware/auth'

const router = Router()
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
})

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

router.post('/transcribe', audioUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ ok: false, error: '음성 파일을 선택해 주세요.' })
      return
    }
    // Android 녹음 앱은 m4a를 audio/mp4가 아닌 application/octet-stream 또는
    // 빈 MIME으로 보내기도 하므로, 알려진 안전한 확장자도 함께 확인합니다.
    const extension = req.file.originalname.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? ''
    const allowedExtensions = new Set(['.m4a', '.mp3', '.mp4', '.mpeg', '.mpga', '.wav', '.webm', '.ogg', '.oga', '.flac'])
    const allowed = /^(audio|video)\//.test(req.file.mimetype) || allowedExtensions.has(extension)
    if (!allowed) {
      res.status(415).json({ ok: false, error: '지원하지 않는 파일 형식입니다. 음성 또는 동영상 파일을 선택해 주세요.' })
      return
    }
    const language = typeof req.body.language === 'string' ? req.body.language.trim() : undefined
    const result = await transcribeWithStoredKey({ file: req.file, language, appId: 'voice-summary' })
    res.status(result.ok ? 200 : 502).json(result)
  } catch (error) {
    next(error)
  }
})

router.post('/together-test', authorize('admin'), async (_req, res, next) => {
  try {
    const result = await testTogetherConnection()
    res.status(result.ok ? 200 : 502).json(result)
  } catch (error) {
    next(error)
  }
})

router.post('/voice-summary', async (req, res, next) => {
  try {
    const transcript = typeof req.body?.transcript === 'string' ? req.body.transcript.trim() : ''
    if (!transcript) {
      res.status(400).json({ ok: false, error: '요약할 음성 인식 원문이 필요합니다.' })
      return
    }
    if (transcript.length > 500_000) {
      res.status(413).json({ ok: false, error: '음성 인식 원문이 너무 깁니다.' })
      return
    }
    const result = await summarizeWithTogether({ transcript })
    res.status(result.ok ? 200 : 502).json(result)
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
