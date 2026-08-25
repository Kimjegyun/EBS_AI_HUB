// 원격 앱(공동 마켓플레이스) 컨트롤러
//
// 관리자가 앱 번들(.js, ESM 한 파일)을 올리면 서버가 보관하고, 허브가 실행 중에
// 내려받아 동적 import 로 등록한다. 앱을 추가하려고 허브를 다시 빌드할 필요가 없다.
//
// 보안 — 원격 앱 코드는 허브와 같은 권한으로 브라우저에서 실행된다.
//   · 업로드는 관리자만 가능하다.
//   · 번들 본문은 인증된 요청으로만 내려간다.
//   · 업로드 시 SHA-256 을 기록해 배포된 파일이 바뀌지 않았는지 확인할 수 있다.
//   · 신뢰할 수 있는 출처의 앱만 올려야 한다. 자세한 내용은 doc/REMOTE_APPS.md 참고.

import { Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { AuthRequest } from '../middleware/auth'
import { run as dbRun, get as dbGet, all as dbAll } from '../config/database'

const APP_DIR = path.join(process.cwd(), 'uploads', 'apps')
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024
const APP_ID_RE = /^[a-z][a-z0-9-]{1,63}$/
const CATEGORIES = ['코어', '생산성', '운영', 'AI'] as const

interface RemoteAppRow {
  app_id: string
  name: string
  icon: string
  description: string
  category: string
  version: string
  author: string | null
  license: string | null
  source_url: string | null
  bundle_name: string
  size: number
  sha256: string
  uploaded_by: string | null
  uploaded_at: string
}

function toDto(row: RemoteAppRow) {
  return {
    id: row.app_id,
    name: row.name,
    icon: row.icon,
    description: row.description,
    category: row.category,
    version: row.version,
    author: row.author,
    license: row.license,
    sourceUrl: row.source_url,
    size: row.size,
    sha256: row.sha256,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  }
}

function bundlePath(row: Pick<RemoteAppRow, 'bundle_name'>): string {
  return path.join(APP_DIR, row.bundle_name)
}

/** 번들이 우리가 기대하는 모양인지 최소한만 확인한다. */
function validateBundle(code: string): string | null {
  if (!code.trim()) return '번들이 비어 있습니다.'
  if (!/export\s+default/.test(code)) {
    return 'ESM 기본 내보내기(export default)가 없습니다. 앱은 팩토리 함수를 default 로 내보내야 합니다.'
  }
  // 정적 import 는 동적 로딩 시 해석되지 않는다 — 호스트가 주는 React 만 쓰도록 강제한다.
  if (/^\s*import\s+[^(]/m.test(code)) {
    return '정적 import 는 사용할 수 없습니다. 호스트가 넘겨주는 React 를 쓰세요 (doc/REMOTE_APPS.md 참고).'
  }
  return null
}

/** GET /api/apps/remote — 등록된 원격 앱 목록 */
export async function listRemoteApps(_req: AuthRequest, res: Response): Promise<void> {
  const rows = (await dbAll('SELECT * FROM remote_apps ORDER BY uploaded_at DESC')) as RemoteAppRow[]
  res.json(rows.filter((r) => fs.existsSync(bundlePath(r))).map(toDto))
}

/** POST /api/apps/remote — 앱 번들 업로드 (관리자) */
export async function uploadRemoteApp(req: AuthRequest, res: Response): Promise<void> {
  const file = (req as any).file as Express.Multer.File | undefined
  if (!file) {
    res.status(400).json({ error: '앱 번들 파일(.js)이 필요합니다.' })
    return
  }
  if (file.size > MAX_BUNDLE_BYTES) {
    res.status(413).json({ error: `번들이 너무 큽니다 (최대 ${MAX_BUNDLE_BYTES / 1024 / 1024}MB).` })
    return
  }

  const body = req.body as Record<string, string>
  const appId = (body.id ?? '').trim().toLowerCase()
  if (!APP_ID_RE.test(appId)) {
    res.status(400).json({ error: '앱 id는 영문 소문자로 시작하고 소문자·숫자·하이픈만 쓸 수 있습니다.' })
    return
  }
  const name = (body.name ?? '').trim()
  if (!name) {
    res.status(400).json({ error: '앱 이름이 필요합니다.' })
    return
  }
  const category = CATEGORIES.includes(body.category as (typeof CATEGORIES)[number])
    ? body.category
    : '생산성'

  const code = file.buffer.toString('utf8')
  const problem = validateBundle(code)
  if (problem) {
    res.status(400).json({ error: problem })
    return
  }

  fs.mkdirSync(APP_DIR, { recursive: true })
  const bundleName = `${appId}.js`
  fs.writeFileSync(path.join(APP_DIR, bundleName), file.buffer)
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex')

  await dbRun(
    `INSERT INTO remote_apps
       (app_id, name, icon, description, category, version, author, license, source_url,
        bundle_name, size, sha256, uploaded_by, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(app_id) DO UPDATE SET
       name = excluded.name, icon = excluded.icon, description = excluded.description,
       category = excluded.category, version = excluded.version, author = excluded.author,
       license = excluded.license, source_url = excluded.source_url,
       bundle_name = excluded.bundle_name, size = excluded.size, sha256 = excluded.sha256,
       uploaded_by = excluded.uploaded_by, uploaded_at = CURRENT_TIMESTAMP`,
    [
      appId, name,
      (body.icon ?? '').trim() || 'extension',
      (body.description ?? '').trim(),
      category,
      (body.version ?? '').trim() || '1.0.0',
      (body.author ?? '').trim() || null,
      (body.license ?? '').trim() || null,
      (body.sourceUrl ?? '').trim() || null,
      bundleName, file.size, sha256, req.user?.id ?? null,
    ],
  )

  const row = (await dbGet('SELECT * FROM remote_apps WHERE app_id = ?', [appId])) as RemoteAppRow
  res.status(201).json({ ok: true, app: toDto(row) })
}

/** GET /api/apps/remote/:id/bundle — 번들 본문 (허브가 동적 import 로 불러감) */
export async function getRemoteAppBundle(req: AuthRequest, res: Response): Promise<void> {
  const row = (await dbGet('SELECT * FROM remote_apps WHERE app_id = ?', [req.params.id])) as
    | RemoteAppRow
    | undefined
  if (!row) {
    res.status(404).json({ error: '앱을 찾을 수 없습니다.' })
    return
  }
  const full = bundlePath(row)
  if (!fs.existsSync(full)) {
    res.status(410).json({ error: '앱 번들이 서버에 없습니다.' })
    return
  }
  res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-App-Sha256', row.sha256)
  fs.createReadStream(full).pipe(res)
}

/** DELETE /api/apps/remote/:id — 앱 삭제 (관리자) */
export async function deleteRemoteApp(req: AuthRequest, res: Response): Promise<void> {
  const row = (await dbGet('SELECT * FROM remote_apps WHERE app_id = ?', [req.params.id])) as
    | RemoteAppRow
    | undefined
  if (!row) {
    res.status(404).json({ error: '앱을 찾을 수 없습니다.' })
    return
  }
  const full = bundlePath(row)
  if (fs.existsSync(full)) fs.unlinkSync(full)
  await dbRun('DELETE FROM remote_apps WHERE app_id = ?', [row.app_id])
  await dbRun('DELETE FROM published_apps WHERE app_id = ?', [row.app_id])
  res.json({ ok: true, id: row.app_id })
}
