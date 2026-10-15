import { Router, Request, Response } from 'express'
import { all, run } from '../config/database'

/**
 * Per-account settings sync (installed apps, dashboard layout, notes, survey
 * preferences, ...). PC (port 3001) and phones (3003 via the public gateway) share
 * this DB, so one account sees the same environment everywhere.
 *
 * Identity comes from the caller's Supabase access token (Bearer), verified with
 * Supabase itself: the hub's shared local/field tokens cannot tell users apart.
 */
const router = Router()

// Read lazily: index.ts calls dotenv.config() after importing the route modules.
const supabaseUrl = () => (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const supabaseAnonKey = () => process.env.SUPABASE_ANON_KEY || ''
const PORTALS = new Set(['user', 'admin'])
const MAX_VALUE_LENGTH = 256 * 1024
const MAX_KEYS = 200
const KEY_PATTERN = /^[\w:.\-[\]",ㄱ-힣 ]{1,200}$/

let tableReady: Promise<void> | null = null
function ensureTable() {
  tableReady ??= run(`CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT NOT NULL, portal TEXT NOT NULL, key TEXT NOT NULL,
    value TEXT, updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, portal, key))`).then(() => undefined)
  return tableReady
}

// Avoid a Supabase round trip on every request; tokens live ~1h, cache briefly.
const verified = new Map<string, { userId: string; until: number }>()
async function supabaseUserId(req: Request): Promise<string | null> {
  const token = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) return null
  const cached = verified.get(token)
  if (cached && cached.until > Date.now()) return cached.userId
  const res = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey(), Authorization: `Bearer ${token}` },
  }).catch(() => null)
  if (!res?.ok) return null
  const user = await res.json().catch(() => null) as { id?: string } | null
  if (!user?.id) return null
  if (verified.size > 500) verified.clear()
  verified.set(token, { userId: user.id, until: Date.now() + 5 * 60_000 })
  return user.id
}

async function identify(req: Request, res: Response) {
  if (!supabaseUrl() || !supabaseAnonKey()) { res.status(503).json({ error: 'SUPABASE_URL / SUPABASE_ANON_KEY가 서버에 설정되지 않았습니다.' }); return null }
  const portal = String(req.params.portal)
  if (!PORTALS.has(portal)) { res.status(400).json({ error: '알 수 없는 포털입니다.' }); return null }
  const userId = await supabaseUserId(req)
  if (!userId) { res.status(401).json({ error: '로그인이 필요합니다.' }); return null }
  await ensureTable()
  return { userId, portal }
}

type Entry = { value: string | null; updatedAt: string }

/** GET /api/users/me/settings/:portal → { settings: { key: { value, updatedAt } } } */
router.get('/:portal', async (req, res) => {
  const who = await identify(req, res)
  if (!who) return
  const rows = await all('SELECT key, value, updated_at FROM user_settings WHERE user_id = ? AND portal = ?', [who.userId, who.portal])
  res.json({ settings: Object.fromEntries(rows.map((row) => [row.key, { value: row.value, updatedAt: row.updated_at }])) })
})

/**
 * PUT /api/users/me/settings/:portal { settings: { key: { value|null, updatedAt } } }
 * Last writer wins per key; a null value records a deletion so it syncs too.
 */
router.put('/:portal', async (req, res) => {
  const who = await identify(req, res)
  if (!who) return
  const incoming = (req.body?.settings ?? {}) as Record<string, Entry>
  const entries = Object.entries(incoming)
  if (entries.length > MAX_KEYS) { res.status(413).json({ error: '설정 항목이 너무 많습니다.' }); return }
  let applied = 0
  for (const [key, entry] of entries) {
    if (!KEY_PATTERN.test(key) || !entry || !Number.isFinite(Date.parse(entry.updatedAt))) continue
    if (entry.value !== null && (typeof entry.value !== 'string' || entry.value.length > MAX_VALUE_LENGTH)) continue
    await run(
      `INSERT INTO user_settings (user_id, portal, key, value, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, portal, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
       WHERE excluded.updated_at >= user_settings.updated_at`,
      [who.userId, who.portal, key, entry.value, new Date(entry.updatedAt).toISOString()],
    )
    applied++
  }
  res.json({ ok: true, applied })
})

export default router
