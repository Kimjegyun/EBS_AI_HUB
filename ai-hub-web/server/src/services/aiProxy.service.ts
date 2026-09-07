import { readEnvironmentData } from '../lib/environmentStore'
import { spawn } from 'child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import ffmpegPath from 'ffmpeg-static'
import { resolveProviderConfig } from '../lib/appAiConfig'
import { appendServerIoLog } from '../lib/ioLogStore'
import { completeTencent } from './tencentComplete'
import {
  gatherLiveWebContext,
  lastUserText,
  liveSources,
  liveSystemMessage,
} from './liveWebContext'

export type ChatRole = 'system' | 'user' | 'assistant'
export type ChatMessage = { role: ChatRole; content: string }
export type ChatResult =
  | { ok: true; content: string; live?: { now: string; sources: Array<{ title: string; url: string }> } }
  | { ok: false; error: string }

type ProviderRequest = {
  provider: 'openai' | 'fal' | 'tencent'
  messages: ChatMessage[]
  model?: string
  endpoint?: string
  appId?: string
}

export type TranscriptionResult =
  | { ok: true; text: string }
  | { ok: false; error: string }

const DIRECT_TOGETHER_BYTES = 8 * 1024 * 1024

async function prepareTogetherAudio(file: Express.Multer.File): Promise<{
  chunks: Array<{ buffer: Buffer; name: string; mimeType: string }>
  cleanup: () => Promise<void>
}> {
  if (file.size <= DIRECT_TOGETHER_BYTES) {
    return { chunks: [{ buffer: file.buffer, name: file.originalname, mimeType: file.mimetype || 'application/octet-stream' }], cleanup: async () => undefined }
  }
  const executable = ffmpegPath
  if (!executable) throw new Error('FFmpeg 실행 파일을 찾지 못했습니다.')
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ai-hub-together-'))
  const inputPath = path.join(tempDir, `input${path.extname(file.originalname) || '.m4a'}`)
  const outputPattern = path.join(tempDir, 'chunk-%03d.mp3')
  await writeFile(inputPath, file.buffer)
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, [
        '-hide_banner', '-loglevel', 'error', '-i', inputPath, '-vn',
        '-ac', '1', '-ar', '16000', '-b:a', '48k',
        '-f', 'segment', '-segment_time', '600', '-reset_timestamps', '1', outputPattern,
      ], { windowsHide: true })
      let stderr = ''
      child.stderr.on('data', (data: Buffer) => { stderr += String(data) })
      child.on('error', reject)
      child.on('close', (code: number | null) => code === 0 ? resolve() : reject(new Error(stderr.trim() || `FFmpeg 종료 코드 ${code}`)))
    })
    const names = (await readdir(tempDir)).filter((name) => /^chunk-\d+\.mp3$/.test(name)).sort()
    if (!names.length) throw new Error('분할된 음성 구간이 없습니다.')
    const chunks = await Promise.all(names.map(async (name) => ({ buffer: await readFile(path.join(tempDir, name)), name, mimeType: 'audio/mpeg' })))
    return { chunks, cleanup: () => rm(tempDir, { recursive: true, force: true }) }
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true })
    throw error
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function describeOpenAiError(status: number, body: string): string {
  let detail = body
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    detail = parsed?.error?.message ?? body
  } catch {
    /* keep raw body */
  }
  if (status === 401) return 'API 키가 올바르지 않거나 권한이 없습니다. (401)'
  if (status === 403) return '이 모델 또는 API에 접근 권한이 없습니다. (403)'
  if (status === 404) return '모델 또는 엔드포인트를 찾을 수 없습니다. 모델 이름을 확인하세요. (404)'
  if (status === 429) return '요청 한도를 초과했거나 크레딧/레이트리밋이 부족합니다. (429)'
  return `요청 실패 (${status}): ${detail}`
}

export async function transcribeWithStoredKey(options: {
  file: Express.Multer.File
  language?: string
  appId?: string
}): Promise<TranscriptionResult> {
  const env = await readEnvironmentData()
  const config = resolveProviderConfig(env, options.appId)
  const apiKey = asString(config.ai_together_api_key)
  const baseUrl = (asString(config.ai_together_base_url) || 'https://api.together.ai/v1').replace(/\/+$/, '')
  const model = asString(config.ai_together_stt_model) || 'openai/whisper-large-v3'
  if (!apiKey) {
    return { ok: false, error: 'Together AI API 키가 설정되지 않았습니다. ADMIN 설정의 음성 요약 앱에서 키를 입력하세요.' }
  }
  if (!/^[\x21-\x7E]+$/.test(apiKey)) {
    return { ok: false, error: '저장된 Together AI 키에 한글·공백·안내 문구가 포함되어 있습니다. ADMIN 설정에서 전체 API 키를 다시 입력하세요.' }
  }

  let prepared: Awaited<ReturnType<typeof prepareTogetherAudio>> | null = null
  try {
    prepared = await prepareTogetherAudio(options.file)
    const texts: string[] = []
    for (let index = 0; index < prepared.chunks.length; index += 1) {
      const chunk = prepared.chunks[index]
      const form = new FormData()
      form.append('file', new Blob([chunk.buffer], { type: chunk.mimeType }), chunk.name)
      form.append('model', model)
      form.append('response_format', 'json')
      if (options.language) form.append('language', options.language)
      const response = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form,
      })
      if (!response.ok) {
        const error = describeTogetherError(response.status, await response.text())
        return { ok: false, error: prepared.chunks.length > 1 ? `${index + 1}/${prepared.chunks.length} 구간: ${error}` : error }
      }
      const data = (await response.json()) as { text?: unknown }
      if (typeof data.text === 'string' && data.text.trim()) texts.push(data.text.trim())
    }
    if (!texts.length) {
      return { ok: false, error: '음성 인식 결과가 비어 있습니다. 음량과 파일 형식을 확인하세요.' }
    }
    return { ok: true, text: texts.join('\n') }
  } catch (error) {
    const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : null
    const detail = cause instanceof Error ? cause.message : ''
    return { ok: false, error: `Together AI STT 서버 연결에 실패했습니다.${detail ? ` ${detail}` : ''}` }
  } finally {
    if (prepared) await prepared.cleanup()
  }
}

function describeTogetherError(status: number, body: string): string {
  let detail = body
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string }
    detail = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message ?? body
  } catch { /* keep raw body */ }
  if (status === 401) return 'Together AI API 키가 올바르지 않습니다. ADMIN 설정에서 키를 다시 입력하세요. (401)'
  if (status === 402) return 'Together AI 크레딧이 부족합니다. Billing에서 결제 상태를 확인하세요. (402)'
  if (status === 413) return 'Together AI 업로드 허용 크기를 초과했습니다. (413)'
  if (status === 429) return 'Together AI 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요. (429)'
  return `Together AI STT 요청 실패 (${status}): ${detail}`
}

export async function testTogetherConnection(appId = 'voice-summary'): Promise<TranscriptionResult> {
  const env = await readEnvironmentData()
  const config = resolveProviderConfig(env, appId)
  const apiKey = asString(config.ai_together_api_key)
  const baseUrl = (asString(config.ai_together_base_url) || 'https://api.together.ai/v1').replace(/\/+$/, '')
  if (!apiKey) return { ok: false, error: 'Together AI API 키가 설정되지 않았습니다.' }
  if (!/^[\x21-\x7E]+$/.test(apiKey)) {
    return { ok: false, error: '저장된 Together AI 키에 한글·공백·안내 문구가 포함되어 있습니다. 전체 API 키를 다시 입력하세요.' }
  }
  try {
    const response = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!response.ok) return { ok: false, error: describeTogetherError(response.status, await response.text()) }
    return { ok: true, text: 'Together AI 연결 성공' }
  } catch {
    return { ok: false, error: 'Together AI 서버에 연결하지 못했습니다.' }
  }
}

export async function summarizeWithTogether(options: {
  transcript: string
  appId?: string
}): Promise<ChatResult> {
  const env = await readEnvironmentData()
  const config = resolveProviderConfig(env, options.appId || 'voice-summary')
  const apiKey = asString(config.ai_together_api_key)
  const baseUrl = (asString(config.ai_together_base_url) || 'https://api.together.ai/v1').replace(/\/+$/, '')
  const model = asString(config.ai_together_summary_model) || 'MiniMaxAI/MiniMax-M3'
  if (!apiKey) return { ok: false, error: 'Together AI API 키가 설정되지 않았습니다.' }
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: '당신은 한국어 회의·강의·인터뷰 정리 전문가입니다. 여러 음성 파일은 표시된 번호 순서대로 이어지는 하나의 연속된 녹음입니다. 앞 파일의 마지막 맥락과 뒤 파일의 시작 맥락을 연결해 전체 흐름을 파악하고 하나의 통합된 내용으로 정리하세요. 사실과 고유명사를 보존하고 추측하지 마세요. 반드시 {"title":"제목","overview":"3~5문장 요약","keyPoints":["핵심 내용"],"actionItems":["후속 조치"]} 형식의 JSON만 출력하세요.',
          },
          { role: 'user', content: options.transcript },
        ],
      }),
    })
    if (!response.ok) return { ok: false, error: describeTogetherError(response.status, await response.text()) }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content?.trim()
    return content ? { ok: true, content } : { ok: false, error: 'Together AI 요약 결과가 비어 있습니다.' }
  } catch {
    return { ok: false, error: 'Together AI 요약 서버에 연결하지 못했습니다.' }
  }
}

function describeFalError(status: number, body: string): string {
  let detail = body
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    detail = String(parsed.detail ?? parsed.error ?? parsed.message ?? body)
  } catch {
    /* keep raw body */
  }
  if (status === 401) return 'fal.ai API 키가 올바르지 않습니다. ADMIN 설정에서 키를 확인하세요. (401)'
  if (status === 403) return 'fal.ai 엔드포인트 접근 권한이 없습니다. 모델 권한을 확인하세요. (403)'
  if (status === 404) return 'fal.ai 모델/엔드포인트를 찾을 수 없습니다. ADMIN 설정의 엔드포인트 ID를 확인하세요. (404)'
  if (status === 429) return 'fal.ai 요청 한도 또는 크레딧이 부족합니다. (429)'
  return `fal.ai 요청 실패 (${status}): ${detail}`
}

function buildResponsesBody(model: string, messages: ChatMessage[]) {
  const instructions = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
  const input = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: [
        {
          type: message.role === 'assistant' ? 'output_text' : 'input_text',
          text: message.content,
        },
      ],
    }))

  return {
    model,
    input,
    ...(instructions ? { instructions } : {}),
  }
}

function extractOpenAiText(data: unknown): string {
  const response = data as {
    output_text?: string
    output?: Array<{ content?: Array<{ text?: string }> }>
    choices?: Array<{ message?: { content?: string } }>
  }
  if (typeof response.output_text === 'string') return response.output_text
  const outputText = response.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? '')
    .join('')
    .trim()
  if (outputText) return outputText
  return response.choices?.[0]?.message?.content ?? ''
}

function extractFalText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(extractFalText).filter(Boolean).join('\n')
  if (!value || typeof value !== 'object') return ''
  const data = value as Record<string, unknown>
  const direct =
    data.output ??
    data.text ??
    data.response ??
    data.answer ??
    data.content ??
    data.message ??
    data.generated_text
  if (direct) return extractFalText(direct)
  const choices = data.choices
  if (Array.isArray(choices)) {
    return choices
      .map((choice) => {
        const item = choice as Record<string, unknown>
        return extractFalText(item.message ?? item.text ?? item.content)
      })
      .filter(Boolean)
      .join('\n')
  }
  return extractFalText(data.data ?? data.result)
}

async function completeOpenAi(
  messages: ChatMessage[],
  config: Record<string, unknown>,
  requestedModel?: string,
): Promise<ChatResult> {
  const apiKey = asString(config.ai_openai_api_key)
  const baseUrl = (asString(config.ai_openai_base_url) || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = requestedModel?.trim() || asString(config.ai_openai_model) || 'gpt-5.6-luna'
  if (!apiKey) {
    return { ok: false, error: 'OpenAI API 키가 설정되지 않았습니다. 설정에서 API 키를 입력하세요.' }
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
  const res = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildResponsesBody(model, messages)),
  })
  if (!res.ok) {
    if (res.status === 400 || res.status === 404) {
      const fallback = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, messages }),
      })
      if (!fallback.ok) {
        return { ok: false, error: describeOpenAiError(fallback.status, await fallback.text()) }
      }
      const data = await fallback.json()
      return { ok: true, content: extractOpenAiText(data) || '응답 본문이 비어 있습니다. 모델 응답 형식을 확인하세요.' }
    }
    return { ok: false, error: describeOpenAiError(res.status, await res.text()) }
  }
  const data = await res.json()
  const content = extractOpenAiText(data)
  return { ok: true, content: content || '응답 본문이 비어 있습니다. 모델 응답 형식을 확인하세요.' }
}

async function completeFal(
  messages: ChatMessage[],
  config: Record<string, unknown>,
  endpoint?: string,
): Promise<ChatResult> {
  const apiKey = asString(config.ai_fal_api_key)
  const baseUrl = (asString(config.ai_fal_base_url) || 'https://queue.fal.run').replace(/\/+$/, '')
  const resolvedEndpoint = (endpoint || '').trim().replace(/^\/+/, '')
  if (!apiKey) {
    return { ok: false, error: 'fal.ai API 키가 설정되지 않았습니다. ADMIN 설정에서 fal.ai 키를 저장하세요.' }
  }
  if (!resolvedEndpoint) {
    return { ok: false, error: 'fal.ai 모델/엔드포인트가 설정되지 않았습니다.' }
  }

  const prompt = messages.map((message) => `${message.role}: ${message.content}`).join('\n\n')
  const res = await fetch(`${baseUrl}/${resolvedEndpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, messages, input: prompt }),
  })
  if (!res.ok) {
    return { ok: false, error: describeFalError(res.status, await res.text()) }
  }
  const data = await res.json()
  const content = extractFalText(data)
  return {
    ok: true,
    content: content || 'fal.ai 응답을 받았지만 텍스트 필드를 찾지 못했습니다. 엔드포인트 응답 형식을 확인하세요.',
  }
}

export async function completeWithStoredKeys(request: ProviderRequest): Promise<ChatResult> {
  const env = await readEnvironmentData()
  const appId = request.provider === 'tencent' ? request.appId || 'my-llm' : request.appId
  const config = resolveProviderConfig(env, appId)
  if (request.provider === 'tencent') {
    const live = await gatherLiveWebContext(lastUserText(request.messages))
    appendServerIoLog({
      direction: 'cmd',
      channel: 'web',
      title: live.searched ? `웹 검색 ${live.hits.length}건` : '웹 검색 생략',
      body: [`now=${live.clock.display}`, live.query ? `q=${live.query}` : '', ...live.hits.map((hit) => hit.url)]
        .filter(Boolean)
        .join('\n'),
    })
    const result = await completeTencent({
      messages: [
        { role: 'system', content: liveSystemMessage(live) },
        ...request.messages,
      ],
      config,
      model: request.model,
      apiUrl: request.endpoint,
    })
    if (result.ok) {
      return {
        ok: true,
        content: result.content,
        live: { now: live.clock.display, sources: liveSources(live) },
      }
    }
    return result
  }
  if (request.provider === 'fal') {
    return completeFal(request.messages, config, request.endpoint)
  }
  return completeOpenAi(request.messages, config, request.model)
}
