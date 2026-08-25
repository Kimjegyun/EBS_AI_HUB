export type IoLogDirection = 'out' | 'in' | 'cmd' | 'info' | 'error'

export type IoLogEntry = {
  id: string
  at: string
  direction: IoLogDirection
  channel: string
  title: string
  body: string
}

const MAX_ENTRIES = 400
const MAX_BODY_CHARS = 80_000

let entries: IoLogEntry[] = []

function makeId(): string {
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

function asDirection(value: unknown): IoLogDirection {
  if (value === 'out' || value === 'in' || value === 'cmd' || value === 'info' || value === 'error') {
    return value
  }
  return 'info'
}

export function listIoLog(): IoLogEntry[] {
  return [...entries]
}

export function appendServerIoLog(input: {
  id?: string
  at?: string
  direction?: unknown
  channel?: unknown
  title?: unknown
  body?: unknown
}): IoLogEntry {
  const entry: IoLogEntry = {
    id: typeof input.id === 'string' && input.id ? input.id : makeId(),
    at: typeof input.at === 'string' && input.at ? input.at : new Date().toISOString(),
    direction: asDirection(input.direction),
    channel: typeof input.channel === 'string' && input.channel ? input.channel : 'server',
    title: redact(typeof input.title === 'string' ? input.title : ''),
    body: clip(redact(typeof input.body === 'string' ? input.body : '')),
  }
  if (entries.some((item) => item.id === entry.id)) return entry
  entries = [...entries, entry].slice(-MAX_ENTRIES)
  return entry
}

export function clearServerIoLog(): void {
  entries = []
}
