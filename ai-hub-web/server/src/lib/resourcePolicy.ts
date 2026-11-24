export type ResourceMode = 'central' | 'user'
export type ResourcePolicy = {
  audioMode: ResourceMode
  workbookMode: ResourceMode
  maxConcurrent: number
  mobileHeavyToServer: boolean
}
export const DEFAULT_RESOURCE_POLICY: ResourcePolicy = { audioMode: 'user', workbookMode: 'user', maxConcurrent: 2, mobileHeavyToServer: true }

export function normalizeResourcePolicy(raw: unknown, strict = false): ResourcePolicy {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const mode = (key: string, fallback: ResourceMode): ResourceMode => {
    if (value[key] === 'central' || value[key] === 'user') return value[key]
    if (strict) throw new Error('처리 위치는 central 또는 user여야 합니다.')
    return fallback
  }
  const max = value.maxConcurrent
  if (strict && value.mobileHeavyToServer !== undefined && typeof value.mobileHeavyToServer !== 'boolean') throw new Error('모바일 서버 전환 설정은 참 또는 거짓이어야 합니다.')
  if (strict && (!Number.isInteger(max) || Number(max) < 1 || Number(max) > 4)) throw new Error('서버 동시 작업 수는 1~4 사이의 정수여야 합니다.')
  return {
    audioMode: mode('audioMode', DEFAULT_RESOURCE_POLICY.audioMode),
    workbookMode: mode('workbookMode', DEFAULT_RESOURCE_POLICY.workbookMode),
    maxConcurrent: Number.isInteger(max) && Number(max) >= 1 && Number(max) <= 4 ? Number(max) : DEFAULT_RESOURCE_POLICY.maxConcurrent,
    mobileHeavyToServer: typeof value.mobileHeavyToServer === 'boolean' ? value.mobileHeavyToServer : true,
  }
}

// User-prepared audio must be bounded PCM, regardless of client-supplied flags or MIME.
export function validatePreparedAudio(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 46 || bytes.byteLength > 4 * 1024 * 1024) return false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (at: number, text: string) => [...text].every((char, i) => bytes[at + i] === char.charCodeAt(0))
  return tag(0, 'RIFF') && tag(8, 'WAVE') && tag(12, 'fmt ') && tag(36, 'data')
    && view.getUint32(4, true) === bytes.length - 8 && view.getUint32(16, true) === 16
    && view.getUint16(20, true) === 1 && view.getUint16(22, true) === 1
    && view.getUint32(24, true) === 16000 && view.getUint32(28, true) === 32000
    && view.getUint16(32, true) === 2 && view.getUint16(34, true) === 16
    && view.getUint32(40, true) === bytes.length - 44 && (bytes.length - 44) % 2 === 0
}
