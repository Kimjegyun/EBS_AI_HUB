import { createHash, createHmac } from 'node:crypto'
import { stdin as input, stdout as output } from 'node:process'

const SERVICE = 'vod'
const VERSION = '2018-07-17'
const ACTION = 'CreateAigcApiToken'
const ENDPOINTS = ['vod.intl.tencentcloudapi.com', 'vod.tencentcloudapi.com']
const LOCAL_API = 'http://127.0.0.1:3001/api/tencent/create-token'

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function hmac(key, message) {
  return createHmac('sha256', key).update(message, 'utf8').digest()
}

function signTc3({ secretId, secretKey, host, body, timestamp }) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const hashedBody = sha256Hex(body)
  const canonicalRequest = [
    'POST',
    '/',
    '',
    `content-type:application/json\nhost:${host}\n`,
    'content-type;host',
    hashedBody,
  ].join('\n')
  const credentialScope = `${date}/${SERVICE}/tc3_request`
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const secretDate = hmac(`TC3${secretKey}`, date)
  const secretService = hmac(secretDate, SERVICE)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = createHmac('sha256', secretSigning).update(stringToSign, 'utf8').digest('hex')
  return [
    'TC3-HMAC-SHA256',
    `Credential=${secretId}/${credentialScope},`,
    'SignedHeaders=content-type;host,',
    `Signature=${signature}`,
  ].join(' ')
}

function hasForbiddenArg(name) {
  return process.argv.includes(`--${name}`)
}

function readHidden(question) {
  return new Promise((resolve, reject) => {
    output.write(question)
    if (typeof input.setRawMode !== 'function') {
      reject(new Error('이 터미널에서는 SecretKey를 숨겨 입력할 수 없습니다. ADMIN 설정 화면에서 발급하세요.'))
      return
    }
    input.setRawMode(true)
    input.resume()
    input.setEncoding('utf8')
    let value = ''
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          cleanup()
          output.write('\n')
          resolve(value)
          return
        }
        if (ch === '\u0003') {
          cleanup()
          output.write('\n')
          process.exit(130)
        }
        if (ch === '\u0008' || ch === '\u007f') {
          value = value.slice(0, -1)
          continue
        }
        if (ch >= ' ') value += ch
      }
    }
    const cleanup = () => {
      input.removeListener('data', onData)
      if (typeof input.setRawMode === 'function') input.setRawMode(false)
    }
    input.on('data', onData)
  })
}

function readVisible(question) {
  return new Promise((resolve) => {
    output.write(question)
    input.resume()
    input.setEncoding('utf8')
    const onData = (chunk) => {
      input.removeListener('data', onData)
      input.pause()
      resolve(String(chunk).replace(/\r?\n$/, ''))
    }
    input.on('data', onData)
  })
}

async function createToken({ secretId, secretKey, subAppId, host }) {
  const body = JSON.stringify({ SubAppId: subAppId })
  const timestamp = Math.floor(Date.now() / 1000)
  const authorization = signTc3({ secretId, secretKey, host, body, timestamp })
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
  const payload = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, payload }
}

async function saveViaLocalApi({ secretId, secretKey, subAppId }) {
  const res = await fetch(LOCAL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secretId, secretKey, subAppId }),
  })
  const payload = await res.json().catch(() => null)
  if (payload?.ok === true) return { ok: true, shape: payload.shape }
  return { ok: false, error: payload?.error || `로컬 API ${res.status}` }
}

function usage() {
  console.error(`SecretId/SecretKey는 명령줄·환경 변수에 넣지 마세요. PowerShell 기록에 남습니다.

권장: ADMIN(https://localhost:5174) Tencent 설정에서 발급

CLI를 쓸 때는 값 없이 실행한 뒤 프롬프트에만 입력하세요.

  cd D:\\!!__AI_HUB\\ai-hub-web
  npm run tencent:create-token

SecretKey는 화면에 표시되지 않습니다. 발급된 ApiToken은 로컬 서버에만 저장됩니다.`)
}

async function main() {
  if (hasForbiddenArg('secret-id') || hasForbiddenArg('secret-key') || hasForbiddenArg('sub-app-id')) {
    usage()
    console.error('\n--secret-id / --secret-key / --sub-app-id 인자는 받지 않습니다.')
    process.exit(1)
  }
  const leftoverEnv = Boolean(process.env.TENCENT_SECRET_ID || process.env.TENCENT_SECRET_KEY)
  delete process.env.TENCENT_SECRET_ID
  delete process.env.TENCENT_SECRET_KEY
  if (leftoverEnv) {
    console.error('세션에 남아 있던 TENCENT_SECRET_* 환경 변수는 무시합니다. 아래에서 다시 입력하세요.\n')
  }
  if (!input.isTTY) {
    usage()
    console.error('\n대화형 터미널이 필요합니다.')
    process.exit(1)
  }

  const secretId = (await readVisible('SecretId: ')).trim()
  const secretKey = (await readHidden('SecretKey (입력 내용 숨김): ')).trim()
  const subAppIdRaw = (await readVisible('SubAppId: ')).trim()
  const subAppId = Number(subAppIdRaw)

  if (!secretId || !secretKey || !Number.isInteger(subAppId) || subAppId <= 0) {
    console.error('SecretId, SecretKey, SubAppId(숫자)가 필요합니다.')
    process.exit(1)
  }

  const saved = await saveViaLocalApi({ secretId, secretKey, subAppId }).catch(() => null)
  if (saved?.ok) {
    console.error(`발급 성공. ApiToken을 서버에만 저장했습니다 (${saved.shape}).`)
    console.error('약 1분 뒤 ADMIN에서 연결 테스트를 하세요. SecretKey는 저장하지 않았습니다.')
    return
  }

  let lastError = saved?.error || ''
  for (const host of ENDPOINTS) {
    const result = await createToken({ secretId, secretKey, subAppId, host })
    const token = result.payload?.Response?.ApiToken
    const error = result.payload?.Response?.Error
    if (typeof token === 'string' && token) {
      console.error(`발급 성공 (${host}). 로컬 서버가 없어 화면에 Token을 한 번만 출력합니다.`)
      console.error('ADMIN Tencent API 키 칸에 붙여넣고, 이 터미널 기록을 지우세요.')
      console.log(token)
      return
    }
    lastError = error
      ? `${error.Code ?? ''}: ${error.Message ?? '오류'}`
      : `HTTP ${result.status}`
    console.error(`${host} 실패`)
  }
  console.error(lastError || 'Token 발급에 실패했습니다.')
  process.exit(1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : '실패')
  process.exit(1)
})
