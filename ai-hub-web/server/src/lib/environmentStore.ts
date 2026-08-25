import { get, run } from '../config/database'
import { mergeEnvironmentConfig, SECRET_ENV_KEYS, APP_AI_SETTINGS_KEY } from './secretFields'
import { encrypt, decrypt } from './crypto'

const CONFIG_ID = 'default'

export type EnvironmentRow = {
  data: Record<string, unknown>
  updatedAt: string | null
}

// ── 암호화/복호화 헬퍼 ────────────────────────────────────────────────────────

/** SECRET_ENV_KEYS에 해당하는 값들을 암호화합니다 (평문 → enc:v1:...) */
function encryptSecrets(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data }
  for (const key of SECRET_ENV_KEYS) {
    const val = result[key]
    if (typeof val === 'string' && val.trim() && !val.startsWith('enc:v1:')) {
      try { result[key] = encrypt(val) } catch { /* ENCRYPTION_KEY 미설정 시 평문 유지 */ }
    }
  }
  // ai_app_settings 내부의 per-app secret도 암호화
  const appSettings = result[APP_AI_SETTINGS_KEY]
  if (appSettings && typeof appSettings === 'object' && !Array.isArray(appSettings)) {
    const encApps: Record<string, unknown> = {}
    for (const [appId, appVal] of Object.entries(appSettings as Record<string, unknown>)) {
      if (appVal && typeof appVal === 'object' && !Array.isArray(appVal)) {
        encApps[appId] = encryptSecrets(appVal as Record<string, unknown>)
      } else {
        encApps[appId] = appVal
      }
    }
    result[APP_AI_SETTINGS_KEY] = encApps
  }
  return result
}

/** enc:v1:... 형식의 값들을 복호화합니다 */
function decryptSecrets(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data }
  for (const key of SECRET_ENV_KEYS) {
    const val = result[key]
    if (typeof val === 'string' && val.startsWith('enc:v1:')) {
      try { result[key] = decrypt(val) } catch { /* 복호화 실패 시 원본 유지 */ }
    }
  }
  const appSettings = result[APP_AI_SETTINGS_KEY]
  if (appSettings && typeof appSettings === 'object' && !Array.isArray(appSettings)) {
    const decApps: Record<string, unknown> = {}
    for (const [appId, appVal] of Object.entries(appSettings as Record<string, unknown>)) {
      if (appVal && typeof appVal === 'object' && !Array.isArray(appVal)) {
        decApps[appId] = decryptSecrets(appVal as Record<string, unknown>)
      } else {
        decApps[appId] = appVal
      }
    }
    result[APP_AI_SETTINGS_KEY] = decApps
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────

export async function readEnvironmentRow(): Promise<EnvironmentRow> {
  const row = await get('SELECT data, updated_at FROM environment_config WHERE id = ?', [CONFIG_ID]) as
    | { data?: string; updated_at?: string }
    | undefined
  if (!row) return { data: {}, updatedAt: null }

  let data: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(row.data ?? '{}') as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // DB에서 읽을 때 복호화
      data = decryptSecrets(parsed as Record<string, unknown>)
    }
  } catch {
    data = {}
  }
  return { data, updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null }
}

export async function readEnvironmentData(): Promise<Record<string, unknown>> {
  const row = await readEnvironmentRow()
  return row.data
}

export async function writeEnvironmentData(incoming: unknown): Promise<void> {
  const existing = await readEnvironmentData()
  const merged = mergeEnvironmentConfig(existing, incoming)
  // DB에 쓰기 전 암호화
  const encrypted = encryptSecrets(merged)
  await run(
    `
      INSERT INTO environment_config (id, data, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        updated_at = CURRENT_TIMESTAMP
    `,
    [CONFIG_ID, JSON.stringify(encrypted)],
  )
}
