import { Router } from 'express'
import { writeEnvironmentData } from '../lib/environmentStore'
import { createAigcApiToken, parseSubAppId } from '../lib/tencentCloudApi'
import { tencentKeyShape } from '../lib/tencentApiKey'
import { appendServerIoLog } from '../lib/ioLogStore'

const router = Router()

function isLoopback(req: { socket?: { remoteAddress?: string } }): boolean {
  const ip = req.socket?.remoteAddress || ''
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

function asSecretId(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function asSecretKey(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

router.post('/create-token', async (req, res, next) => {
  const secretId = asSecretId(req.body?.secretId)
  const secretKey = asSecretKey(req.body?.secretKey)
  const subAppId = parseSubAppId(req.body?.subAppId)
  req.body = {}

  try {
    if (!isLoopback(req)) {
      res.status(403).json({ ok: false, error: '이 PC의 로컬 서버에서만 Token을 발급할 수 있습니다.' })
      return
    }

    if (!secretId || !secretKey || !subAppId) {
      res.status(400).json({ ok: false, error: 'SecretId, SecretKey, SubAppId가 필요합니다.' })
      return
    }
    if (!/^[AI]KID[A-Za-z0-9]+$/i.test(secretId)) {
      res.status(400).json({ ok: false, error: 'SecretId 형식이 아닙니다. 콘솔 API Keys의 IKID/AKID 값을 넣으세요.' })
      return
    }
    if ([...secretKey].some((ch) => ch.charCodeAt(0) > 127) || secretKey.length < 8) {
      res.status(400).json({ ok: false, error: 'SecretKey가 올바르지 않습니다.' })
      return
    }

    appendServerIoLog({
      direction: 'cmd',
      channel: 'tencent',
      title: 'CreateAigcApiToken',
      body: `subAppId=${subAppId}`,
    })

    const result = await createAigcApiToken({ secretId, secretKey, subAppId })
    if (!result.ok) {
      appendServerIoLog({
        direction: 'error',
        channel: 'tencent',
        title: 'CreateAigcApiToken FAIL',
        body: result.error,
      })
      res.status(200).json({ ok: false, error: result.error })
      return
    }

    await writeEnvironmentData({
      ai_app_settings: {
        'my-llm': {
          ai_tencent_api_key: result.token,
        },
      },
    })

    appendServerIoLog({
      direction: 'in',
      channel: 'tencent',
      title: 'CreateAigcApiToken OK',
      body: `${tencentKeyShape(result.token)} · ${result.host}`,
    })

    res.status(200).json({
      ok: true,
      shape: tencentKeyShape(result.token),
    })
  } catch (error) {
    next(error)
  }
})

export default router
