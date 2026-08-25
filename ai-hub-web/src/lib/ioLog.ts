import { getLocalApiBaseUrl } from './localApi'

export type IoLogDirection = 'out' | 'in' | 'cmd' | 'info' | 'error'

export type IoLogEntry = {
  id: string
  at: string
  direction: IoLogDirection
  channel: string
  title: string
  body: string
}

const STORAGE_KEY = 'ai-hub-io-log-v1'
const CHANNEL_NAME = 'ai-hub-io-log'
const MAX_ENTRIES = 400
const MAX_BODY_CHARS = 80_000

type Listener = (entries: IoLogEntry[]) => void

const listeners = new Set<Listener>()
let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = () => {
      void refreshFromServer()
    }
  }
  return channel
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function redact(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, 'Bearer ***')
    .replace(/("?(?:apiKey|api_key|secretKey|secret_key|secretId|secret_id|authorization)"?\s*[:=]\s*")[^"]+/gi, '$1***')
    .replace(/\b[AI]KID[A-Za-z0-9]{8,}\b/g, 'IKID***')
}

function clip(text: string): string {
  if (text.length <= MAX_BODY_CHARS) return text
  return `${text.slice(0, MAX_BODY_CHARS)}\n\n... (잘림, ${text.length - MAX_BODY_CHARS}자)`
}

function readEntries(): IoLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as IoLogEntry[]) : []
  } catch {
    return []
  }
}

function writeEntries(entries: IoLogEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)))
}

function notify(entries: IoLogEntry[]): void {
  listeners.forEach((listener) => {
    try {
      listener(entries)
    } catch (err) {
      console.error('io log listener failed:', err)
    }
  })
}

function mergeEntries(groups: IoLogEntry[][]): IoLogEntry[] {
  const map = new Map<string, IoLogEntry>()
  for (const group of groups) {
    for (const entry of group) {
      if (entry?.id) map.set(entry.id, entry)
    }
  }
  return [...map.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_ENTRIES)
}

function apiUrl(path = ''): string {
  return `${getLocalApiBaseUrl()}/api/io-log${path}`
}

async function pullRemote(): Promise<IoLogEntry[]> {
  try {
    const res = await fetch(apiUrl())
    if (!res.ok) return []
    const data = (await res.json()) as { entries?: IoLogEntry[] }
    return Array.isArray(data.entries) ? data.entries : []
  } catch {
    return []
  }
}

function pushRemote(entry: IoLogEntry): void {
  void fetch(apiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => undefined)
}

async function refreshFromServer(): Promise<IoLogEntry[]> {
  const merged = mergeEntries([readEntries(), await pullRemote()])
  const nextRaw = JSON.stringify(merged)
  if (nextRaw !== localStorage.getItem(STORAGE_KEY)) {
    writeEntries(merged)
    notify(merged)
  }
  return merged
}

export function getIoLog(): IoLogEntry[] {
  return readEntries()
}

export function appendIoLog(input: {
  direction: IoLogDirection
  channel: string
  title: string
  body?: string
}): IoLogEntry {
  const entry: IoLogEntry = {
    id: makeId(),
    at: new Date().toISOString(),
    direction: input.direction,
    channel: input.channel,
    title: redact(input.title),
    body: clip(redact(input.body ?? '')),
  }
  const next = mergeEntries([readEntries(), [entry]])
  writeEntries(next)
  getChannel()?.postMessage({ type: 'append', id: entry.id })
  notify(next)
  pushRemote(entry)
  return entry
}

export function clearIoLog(): void {
  writeEntries([])
  getChannel()?.postMessage({ type: 'clear' })
  notify([])
  void fetch(apiUrl(), { method: 'DELETE' }).catch(() => undefined)
}

export function subscribeIoLog(listener: Listener): () => void {
  getChannel()
  listeners.add(listener)
  void refreshFromServer().then((entries) => listener(entries))
  const poll = window.setInterval(() => {
    if (document.visibilityState === 'hidden') return
    void refreshFromServer()
  }, 2500)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener(readEntries())
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.clearInterval(poll)
    window.removeEventListener('storage', onStorage)
  }
}

export function formatIoLogEntry(entry: IoLogEntry): string {
  const time = entry.at.replace('T', ' ').replace('Z', ' UTC')
  const arrow =
    entry.direction === 'out'
      ? '>> OUT'
      : entry.direction === 'in'
        ? '<< IN '
        : entry.direction === 'cmd'
          ? ':: CMD'
          : entry.direction === 'error'
            ? '!! ERR'
            : '-- INF'
  const header = `${time}  ${arrow}  [${entry.channel}]  ${entry.title}`
  const line = '-'.repeat(Math.min(header.length, 88))
  return entry.body.trim() ? `${header}\n${line}\n${entry.body.trim()}` : header
}

export function formatIoLog(entries: IoLogEntry[] = readEntries()): string {
  if (entries.length === 0) {
    return [
      '명령 단위 입출력 분석기입니다. 로그인하지 않습니다.',
      '',
      'USER(https://localhost:5173) 또는 ADMIN(https://localhost:5174)에서',
      '채팅·API를 실행하면 요청(OUT)과 응답(IN)이 여기에 시간순으로 쌓입니다.',
    ].join('\n')
  }
  return entries.map(formatIoLogEntry).join(`\n\n${'='.repeat(88)}\n\n`)
}

export function formatChatMessages(
  messages: Array<{ role: string; content: string }>,
): string {
  return messages
    .map((message) => `[${message.role}]\n${message.content}`)
    .join('\n\n')
}
