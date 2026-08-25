import { createHash, createHmac } from 'node:crypto'

const SERVICE = 'vod'
const VERSION = '2018-07-17'
const ACTION = 'CreateAigcApiToken'
const ENDPOINTS = ['vod.intl.tencentcloudapi.com', 'vod.tencentcloudapi.com'] as const

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function hmac(key: string | Buffer, message: string): Buffer {
  return createHmac('sha256', key).update(message, 'utf8').digest()
}

function signTc3(input: {
  secretId: string
  secretKey: string
  host: string
  body: string
  timestamp: number
}): string {
  const date = new Date(input.timestamp * 1000).toISOString().slice(0, 10)
  const hashedBody = sha256Hex(input.body)
  const canonicalRequest = [
    'POST',
    '/',
    '',
    `content-type:application/json\nhost:${input.host}\n`,
    'content-type;host',
    hashedBody,
  ].join('\n')
  const credentialScope = `${date}/${SERVICE}/tc3_request`
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(input.timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const secretDate = hmac(`TC3${input.secretKey}`, date)
  const secretService = hmac(secretDate, SERVICE)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = createHmac('sha256', secretSigning).update(stringToSign, 'utf8').digest('hex')
  return [
    'TC3-HMAC-SHA256',
    `Credential=${input.secretId}/${credentialScope},`,
    'SignedHeaders=content-type;host,',
    `Signature=${signature}`,
  ].join(' ')
}

export function parseSubAppId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value.trim())
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

export async function createAigcApiToken(input: {
  secretId: string
  secretKey: string
  subAppId: number
}): Promise<{ ok: true; token: string; host: string } | { ok: false; error: string }> {
  const secretId = input.secretId.trim()
  const secretKey = input.secretKey.trim()
  const body = JSON.stringify({ SubAppId: input.subAppId })
  const timestamp = Math.floor(Date.now() / 1000)
  let lastError = 'Token 발급에 실패했습니다.'

  for (const host of ENDPOINTS) {
    const authorization = signTc3({ secretId, secretKey, host, body, timestamp })
    try {
      const res = await fetch(`https://${host}/`, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
          Host: host,
          'X-TC-Action': ACTION,
          'X-TC-Version': VERSION,
          'X-TC-Timestamp': String(timestamp),
        },
        body,
      })
      const payload = (await res.json().catch(() => null)) as {
        Response?: { ApiToken?: unknown; Error?: { Code?: string; Message?: string } }
      } | null
      const token = payload?.Response?.ApiToken
      if (typeof token === 'string' && token.trim()) {
        return { ok: true, token: token.trim(), host }
      }
      const err = payload?.Response?.Error
      lastError = err?.Message
        ? `${err.Code ?? 'Error'}: ${err.Message}`
        : `HTTP ${res.status}`
    } catch (err) {
      lastError = err instanceof Error ? err.message : '네트워크 오류'
    }
  }

  return { ok: false, error: lastError }
}
