import type { ChatMessage, ChatResult } from './openaiClient'
import { authHeaders, describeAuthStatus } from './authHeaders'
import { appendIoLog, formatChatMessages } from './ioLog'
import { getLocalApiBaseUrl } from './localApi'
import { supabase } from './supabase'

type GatewayRequest = {
  provider: 'openai' | 'fal' | 'tencent'
  messages: ChatMessage[]
  model?: string
  endpoint?: string
  appId?: string
  skipUsageCheck?: boolean
}

const GENERIC_ERRORS = new Set([
  'Edge Function returned a non-2xx status code',
  'AI 프록시 호출에 실패했습니다.',
  'AI 게이트웨이에서 응답을 받지 못했습니다.',
  'AI 게이트웨이 응답 형식이 올바르지 않습니다.',
])

function asChatResult(value: unknown): ChatResult {
  if (!value || typeof value !== 'object') {
    return { ok: false, error: 'AI 게이트웨이 응답 형식이 올바르지 않습니다.' }
  }
  const data = value as { ok?: unknown; content?: unknown; error?: unknown; live?: unknown }
  if (data.ok === true && typeof data.content === 'string') {
    const live = asLiveMeta(data.live)
    return live ? { ok: true, content: data.content, live } : { ok: true, content: data.content }
  }
  if (typeof data.error === 'string' && data.error) {
    return { ok: false, error: data.error }
  }
  return { ok: false, error: 'AI 게이트웨이에서 응답을 받지 못했습니다.' }
}

function asLiveMeta(value: unknown): { now: string; sources: Array<{ title: string; url: string }> } | null {
  if (!value || typeof value !== 'object') return null
  const data = value as { now?: unknown; sources?: unknown }
  if (typeof data.now !== 'string' || !Array.isArray(data.sources)) return null
  const sources = data.sources
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const source = item as { title?: unknown; url?: unknown }
      if (typeof source.url !== 'string' || !source.url) return null
      return {
        title: typeof source.title === 'string' && source.title ? source.title : source.url,
        url: source.url,
      }
    })
    .filter((item): item is { title: string; url: string } => Boolean(item))
  return { now: data.now, sources }
}

function isGenericGatewayError(message: string): boolean {
  return GENERIC_ERRORS.has(message)
}

function isAuthGatewayError(message: string): boolean {
  return /unauthorized|승인된 사용자만/i.test(message)
}

async function readInvokeErrorBody(error: unknown): Promise<string | null> {
  if (!error || typeof error !== 'object' || !('context' in error)) return null
  const context = (error as { context?: unknown }).context
  if (!context || typeof context !== 'object' || !('json' in context)) return null
  try {
    const body = await (context as Response).clone().json()
    const parsed = asChatResult(body)
    if (parsed.ok) return null
    return isGenericGatewayError(parsed.error) ? null : parsed.error
  } catch {
    return null
  }
}

function requestLogBody(request: GatewayRequest): string {
  return [
    `provider=${request.provider}`,
    `model=${request.model ?? ''}`,
    `endpoint=${request.endpoint ?? ''}`,
    `appId=${request.appId ?? ''}`,
    `skipUsageCheck=${request.skipUsageCheck === true}`,
    '',
    formatChatMessages(request.messages),
  ].join('\n')
}

function logGateway(channel: string, direction: 'out' | 'in' | 'error', title: string, body: string) {
  appendIoLog({ direction, channel, title, body })
}

async function postLocalComplete(url: string, request: GatewayRequest): Promise<ChatResult> {
  logGateway('local', 'out', `POST ${url}`, requestLogBody(request))
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(request),
    })
    const payload = await res.json().catch(() => null)
    if (!res.ok) {
      const authMessage = describeAuthStatus(res.status)
      const message =
        authMessage
          ? authMessage
          : payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : res.status === 502
            ? '로컬 AI 서버가 꺼져 있거나 아직 시작되지 않았습니다. server 폴더에서 npm run dev를 실행하세요.'
            : `AI 게이트웨이 요청 실패 (${res.status})`
      logGateway('local', 'error', `HTTP ${res.status} FAIL`, message)
      return { ok: false, error: message }
    }
    const result = asChatResult(payload)
    logGateway(
      'local',
      result.ok ? 'in' : 'error',
      result.ok ? `HTTP ${res.status} OK` : `HTTP ${res.status} FAIL`,
      result.ok ? result.content : result.error,
    )
    return result
  } catch (err) {
    const raw = (err as Error).message
    const message = /ECONNREFUSED|Failed to fetch|NetworkError/i.test(raw)
      ? '로컬 AI 서버에 연결하지 못했습니다. ai-hub-web/server에서 npm run dev가 실행 중인지 확인하세요.'
      : `로컬 AI 게이트웨이에 연결하지 못했습니다: ${raw}`
    logGateway('local', 'error', 'FETCH FAIL', message)
    return { ok: false, error: message }
  }
}

async function completeViaLocalGateway(request: GatewayRequest): Promise<ChatResult> {
  const urls =
    typeof window !== 'undefined'
      ? ['/api/ai/complete']
      : [`${getLocalApiBaseUrl() || 'http://127.0.0.1:3001'}/api/ai/complete`]
  let last: ChatResult | null = null
  for (const url of urls) {
    last = await postLocalComplete(url, request)
    if (last.ok) return last
  }
  return last ?? { ok: false, error: '로컬 AI 게이트웨이에 연결하지 못했습니다.' }
}

async function completeViaEdgeFunction(request: GatewayRequest): Promise<ChatResult> {
  if (!supabase) {
    const message = 'AI 프록시 호출에 실패했습니다.'
    logGateway('edge', 'error', 'supabase 미설정', message)
    return { ok: false, error: message }
  }
  logGateway('edge', 'out', "POST supabase.functions.invoke('ai-proxy')", requestLogBody(request))
  const { data, error } = await supabase.functions.invoke('ai-proxy', { body: request })
  if (data) {
    const parsed = asChatResult(data)
    if (parsed.ok || !isGenericGatewayError(parsed.error)) {
      logGateway(
        'edge',
        parsed.ok ? 'in' : 'error',
        parsed.ok ? 'INVOKE OK' : 'INVOKE FAIL',
        parsed.ok ? parsed.content : parsed.error,
      )
      return parsed
    }
  }
  const fromBody = await readInvokeErrorBody(error)
  if (fromBody) {
    logGateway('edge', 'error', 'INVOKE FAIL', fromBody)
    return { ok: false, error: fromBody }
  }
  const message = error?.message || 'AI 프록시 호출에 실패했습니다.'
  logGateway(
    'edge',
    'error',
    'INVOKE FAIL',
    [message, data ? `data=${JSON.stringify(data)}` : 'data=null'].join('\n'),
  )
  if (error?.message) return { ok: false, error: error.message }
  return asChatResult(data)
}

function preferResult(primary: ChatResult, fallback: ChatResult): ChatResult {
  if (primary.ok) return primary
  if (fallback.ok) return fallback
  if (!isGenericGatewayError(primary.error)) return primary
  return fallback
}

export async function completeViaGateway(request: GatewayRequest): Promise<ChatResult> {
  // Tencent keys live on the local API. Falling back to the cloud Edge Function
  // often yields "provider와 messages가 필요합니다." because the deployed
  // function does not unwrap the invoke payload the same way.
  if (request.provider === 'tencent') {
    return completeViaLocalGateway(request)
  }

  if (!supabase) return completeViaLocalGateway(request)

  const edgeResult = await completeViaEdgeFunction(request)
  if (edgeResult.ok || isAuthGatewayError(edgeResult.error)) return edgeResult

  const localResult = await completeViaLocalGateway(request)
  return preferResult(edgeResult, localResult)
}
