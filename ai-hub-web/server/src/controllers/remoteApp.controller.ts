// 원격 앱(공동 마켓플레이스) 컨트롤러 — 제출 → 심사 → 승인 → 배포
//
// 흐름
//   1. 사용자가 번들을 제출한다        status=pending   (코드는 아직 아무에게도 안 나간다)
//   2. 관리자가 코드를 읽고 판단한다    승인 / 반려(사유)
//   3. 승인된 버전만 배포된다          remote_apps.current_version_id 가 가리키는 버전
//   4. 문제가 생기면 즉시 정지한다      status=suspended → 배포 중단
//
// 승인은 앱이 아니라 "버전" 단위다. 승인받은 앱을 나중에 다른 코드로 바꿔치기해도
// 새 버전은 다시 pending 이 되므로 승인을 우회할 수 없다.
//
// 보안 — 원격 앱 코드는 허브와 같은 권한으로 브라우저에서 실행된다.
//   · 승인 전 번들은 관리자와 제출자 본인에게만 내려간다.
//   · 승인된 번들만 일반 사용자에게 내려간다.
//   · 업로드 시 SHA-256 을 기록해 배포된 파일이 바뀌지 않았는지 확인할 수 있다.
//   · 격리(샌드박스)는 아직 없다. 심사가 유일한 방어선이다. doc/REMOTE_APPS.md 참고.

import { Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { AuthRequest } from '../middleware/auth'
import { run as dbRun, get as dbGet, all as dbAll } from '../config/database'

const APP_DIR = path.join(process.cwd(), 'uploads', 'apps')
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024
const APP_ID_RE = /^[a-z][a-z0-9-]{1,63}$/
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.\-+]{0,31}$/
const CATEGORIES = ['코어', '생산성', '운영', 'AI'] as const

/** 제출자가 선언하는 접근 범위. 심사자가 무엇을 확인해야 하는지 알려준다. */
export const PERMISSIONS = ['network', 'storage', 'hub-api', 'ai', 'clipboard'] as const
type Permission = (typeof PERMISSIONS)[number]

type Status = 'pending' | 'approved' | 'rejected' | 'suspended'

interface VersionRow {
  id: number
  app_id: string
  version: string
  name: string
  icon: string
  description: string
  category: string
  author: string | null
  license: string | null
  source_url: string | null
  permissions: string
  submit_note: string
  bundle_name: string
  size: number
  sha256: string
  status: Status
  submitted_by: string | null
  submitted_by_name: string | null
  submitted_at: string
  reviewed_by: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  review_note: string
}

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────────

function bundlePath(bundleName: string): string {
  return path.join(APP_DIR, bundleName)
}

function parsePermissions(raw: unknown): Permission[] {
  let list: unknown = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      list = raw.split(',')
    }
  }
  if (!Array.isArray(list)) return []
  return list
    .map((v) => String(v).trim())
    .filter((v): v is Permission => (PERMISSIONS as readonly string[]).includes(v))
}

/** 목록·카탈로그에 쓰는 형태. 번들 코드는 넣지 않는다. */
function toDto(row: VersionRow) {
  return {
    id: row.app_id,
    versionId: row.id,
    name: row.name,
    icon: row.icon,
    description: row.description,
    category: row.category,
    version: row.version,
    author: row.author,
    license: row.license,
    sourceUrl: row.source_url,
    permissions: parsePermissions(row.permissions),
    submitNote: row.submit_note,
    size: row.size,
    sha256: row.sha256,
    status: row.status,
    submittedBy: row.submitted_by,
    submittedByName: row.submitted_by_name,
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by,
    reviewedByName: row.reviewed_by_name,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    // 하위 호환 — 예전 클라이언트가 uploadedAt 을 읽는다.
    uploadedBy: row.submitted_by,
    uploadedAt: row.submitted_at,
  }
}

/** 번들이 우리가 기대하는 모양인지 최소한만 확인한다. */
function validateBundle(code: string): string | null {
  if (!code.trim()) return '번들이 비어 있습니다.'
  // 번들러가 minify 하면 `export{x as default}` 형태가 되므로 둘 다 받는다.
  if (!/export\s+default\b/.test(code) && !/\bas\s+default\b/.test(code)) {
    return 'ESM 기본 내보내기(export default)가 없습니다. 앱은 팩토리 함수를 default 로 내보내야 합니다.'
  }
  // 정적 import 는 동적 로딩 시 해석되지 않는다 — 호스트가 주는 React 만 쓰도록 강제한다.
  if (/^\s*import\s+[^(]/m.test(code)) {
    return '정적 import 는 사용할 수 없습니다. 호스트가 넘겨주는 React 를 쓰세요 (doc/REMOTE_APPS.md 참고).'
  }
  return null
}

/**
 * 코드를 훑어 선언하지 않은 접근이 있는지 표시한다.
 *
 * 우회하기 쉬운 검사라 차단에는 쓰지 않는다. 심사자가 어디를 봐야 하는지
 * 알려주는 용도다. 판단은 사람이 한다.
 */
export function scanUndeclared(code: string, declared: Permission[]): string[] {
  const checks: Array<{ perm: Permission; re: RegExp; label: string }> = [
    { perm: 'network', re: /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/, label: '네트워크 호출' },
    { perm: 'storage', re: /\b(localStorage|sessionStorage|indexedDB)\b/, label: '브라우저 저장소' },
    { perm: 'hub-api', re: /['"`]\/api\//, label: '허브 API 호출' },
    { perm: 'ai', re: /\/api\/ai\b/, label: 'AI 게이트웨이 호출' },
    { perm: 'clipboard', re: /navigator\.clipboard/, label: '클립보드' },
  ]
  const found: string[] = []
  for (const c of checks) {
    if (c.re.test(code) && !declared.includes(c.perm)) found.push(`${c.label} (${c.perm} 미선언)`)
  }
  // 심사자가 반드시 봐야 하는 패턴 — 선언과 무관하게 표시한다.
  if (/\beval\s*\(|new\s+Function\s*\(/.test(code)) found.push('eval / new Function — 동적 코드 실행')
  if (/document\.cookie/.test(code)) found.push('document.cookie 접근')
  return found
}

async function getApp(appId: string) {
  return (await dbGet('SELECT * FROM remote_apps WHERE app_id = ?', [appId])) as
    | { app_id: string; owner_id: string | null; current_version_id: number | null }
    | undefined
}

async function getVersion(versionId: number): Promise<VersionRow | undefined> {
  return (await dbGet('SELECT * FROM remote_app_versions WHERE id = ?', [versionId])) as
    | VersionRow
    | undefined
}

/** 지금 배포 중인 버전. 승인 상태가 아니면 배포하지 않는다. */
async function getLiveVersion(appId: string): Promise<VersionRow | undefined> {
  return (await dbGet(
    `SELECT v.* FROM remote_apps a
       JOIN remote_app_versions v ON v.id = a.current_version_id
      WHERE a.app_id = ? AND v.status = 'approved'`,
    [appId],
  )) as VersionRow | undefined
}

function isAdmin(req: AuthRequest): boolean {
  return req.user?.role === 'admin'
}

// ── 제출 ─────────────────────────────────────────────────────────────────────

/**
 * 번들과 메타데이터를 받아 버전 행을 만든다.
 *
 * autoApprove 는 관리자가 직접 올리거나 가져올 때만 쓴다. 그 경우 관리자가
 * 이미 파일을 확인한 것으로 본다.
 */
async function createVersion(
  req: AuthRequest,
  input: {
    appId: string
    buffer: Buffer
    meta: Record<string, unknown>
    autoApprove: boolean
  },
): Promise<{ error?: string; status?: number; version?: VersionRow }> {
  const { appId, buffer, meta } = input

  if (!APP_ID_RE.test(appId)) {
    return { status: 400, error: '앱 id는 영문 소문자로 시작하고 소문자·숫자·하이픈만 쓸 수 있습니다.' }
  }
  if (buffer.length > MAX_BUNDLE_BYTES) {
    return { status: 413, error: `번들이 너무 큽니다 (최대 ${MAX_BUNDLE_BYTES / 1024 / 1024}MB).` }
  }
  const name = String(meta.name ?? '').trim()
  if (!name) return { status: 400, error: '앱 이름이 필요합니다.' }

  const version = String(meta.version ?? '').trim() || '1.0.0'
  if (!VERSION_RE.test(version)) {
    return { status: 400, error: '버전은 영문·숫자·점·하이픈만 쓸 수 있습니다 (예: 1.0.0).' }
  }

  const code = buffer.toString('utf8')
  const problem = validateBundle(code)
  if (problem) return { status: 400, error: problem }

  // 이미 있는 앱이면 소유자만 새 버전을 낼 수 있다. 관리자는 예외다.
  const app = await getApp(appId)
  if (app && app.owner_id && app.owner_id !== req.user?.id && !isAdmin(req)) {
    return { status: 403, error: '이 앱 id는 다른 사용자가 등록했습니다. 다른 id를 쓰세요.' }
  }

  const dup = (await dbGet(
    'SELECT id, status FROM remote_app_versions WHERE app_id = ? AND version = ?',
    [appId, version],
  )) as { id: number; status: Status } | undefined
  if (dup && dup.status !== 'rejected') {
    return { status: 409, error: `버전 ${version} 은 이미 제출되어 있습니다. 버전을 올려 주세요.` }
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')

  // 버전마다 파일을 따로 둔다 — 승인된 버전이 나중 제출로 덮이면 안 된다.
  fs.mkdirSync(APP_DIR, { recursive: true })
  const bundleName = `${appId}@${version}-${sha256.slice(0, 8)}.js`
  fs.writeFileSync(bundlePath(bundleName), buffer)

  const category = CATEGORIES.includes(meta.category as (typeof CATEGORIES)[number])
    ? String(meta.category)
    : '생산성'
  const status: Status = input.autoApprove ? 'approved' : 'pending'
  const icon = String(meta.icon ?? '').trim() || 'extension'
  const description = String(meta.description ?? '').trim()
  const author = String(meta.author ?? '').trim() || null
  const license = String(meta.license ?? '').trim() || null
  const sourceUrl = String(meta.sourceUrl ?? '').trim() || null

  const inserted = await dbRun(
    `INSERT INTO remote_app_versions
       (app_id, version, name, icon, description, category, author, license, source_url,
        permissions, submit_note, bundle_name, size, sha256, status,
        submitted_by, submitted_by_name, submitted_at,
        reviewed_by, reviewed_by_name, reviewed_at, review_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)`,
    [
      appId,
      version,
      name,
      icon,
      description,
      category,
      author,
      license,
      sourceUrl,
      JSON.stringify(parsePermissions(meta.permissions)),
      String(meta.submitNote ?? '').trim().slice(0, 2000),
      bundleName,
      buffer.length,
      sha256,
      status,
      req.user?.id ?? null,
      req.user?.email ?? null,
      input.autoApprove ? req.user?.id ?? null : null,
      input.autoApprove ? req.user?.email ?? null : null,
      input.autoApprove ? new Date().toISOString() : null,
      input.autoApprove ? '관리자가 직접 등록했습니다.' : '',
    ],
  )
  const versionId = inserted.lastID as number

  // 앱 식별 행 — 없으면 만든다. 배포 포인터는 승인될 때만 움직인다.
  await dbRun(
    `INSERT INTO remote_apps
       (app_id, name, icon, description, category, version, author, license, source_url,
        bundle_name, size, sha256, uploaded_by, uploaded_at, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(app_id) DO NOTHING`,
    [
      appId,
      name,
      icon,
      description,
      category,
      version,
      author,
      license,
      sourceUrl,
      bundleName,
      buffer.length,
      sha256,
      req.user?.id ?? null,
      req.user?.id ?? null,
    ],
  )

  if (input.autoApprove) await publishVersion(appId, versionId)

  return { version: await getVersion(versionId) }
}

/** 배포 포인터를 이 버전으로 옮기고, remote_apps 의 표시용 값도 맞춘다. */
async function publishVersion(appId: string, versionId: number): Promise<void> {
  const v = await getVersion(versionId)
  if (!v) return
  await dbRun(
    `UPDATE remote_apps SET
       current_version_id = ?, name = ?, icon = ?, description = ?, category = ?,
       version = ?, author = ?, license = ?, source_url = ?,
       bundle_name = ?, size = ?, sha256 = ?
     WHERE app_id = ?`,
    [
      versionId,
      v.name,
      v.icon,
      v.description,
      v.category,
      v.version,
      v.author,
      v.license,
      v.source_url,
      v.bundle_name,
      v.size,
      v.sha256,
      appId,
    ],
  )
}

/** POST /api/apps/remote/submit — 누구나 제출할 수 있다. 심사를 거쳐야 배포된다. */
export async function submitRemoteApp(req: AuthRequest, res: Response): Promise<void> {
  const file = (req as any).file as Express.Multer.File | undefined
  if (!file) {
    res.status(400).json({ error: '앱 번들 파일(.js)이 필요합니다.' })
    return
  }
  const body = req.body as Record<string, string>
  const result = await createVersion(req, {
    appId: (body.id ?? '').trim().toLowerCase(),
    buffer: file.buffer,
    meta: body,
    autoApprove: false,
  })
  if (result.error) {
    res.status(result.status ?? 400).json({ error: result.error })
    return
  }
  res.status(201).json({ ok: true, version: toDto(result.version!) })
}

/** POST /api/apps/remote — 관리자 직접 등록. 심사를 건너뛴다. */
export async function uploadRemoteApp(req: AuthRequest, res: Response): Promise<void> {
  const file = (req as any).file as Express.Multer.File | undefined
  if (!file) {
    res.status(400).json({ error: '앱 번들 파일(.js)이 필요합니다.' })
    return
  }
  const body = req.body as Record<string, string>
  const result = await createVersion(req, {
    appId: (body.id ?? '').trim().toLowerCase(),
    buffer: file.buffer,
    meta: body,
    autoApprove: true,
  })
  if (result.error) {
    res.status(result.status ?? 400).json({ error: result.error })
    return
  }
  res.status(201).json({ ok: true, app: toDto(result.version!) })
}

// ── 목록 ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/apps/remote — 배포 중인 앱 목록
 *
 * 승인된 앱만 나간다. 목록에 없으면 클라이언트가 번들을 받아가지 않으므로
 * 심사를 통과하지 않은 코드는 사용자 브라우저에서 실행되지 않는다.
 */
export async function listRemoteApps(_req: AuthRequest, res: Response): Promise<void> {
  const rows = (await dbAll(
    `SELECT v.* FROM remote_apps a
       JOIN remote_app_versions v ON v.id = a.current_version_id
      WHERE v.status = 'approved'
      ORDER BY v.submitted_at DESC`,
  )) as VersionRow[]
  res.json(rows.filter((r) => fs.existsSync(bundlePath(r.bundle_name))).map(toDto))
}

/** GET /api/apps/remote/submissions — 심사 대기·이력 (관리자) */
export async function listSubmissions(req: AuthRequest, res: Response): Promise<void> {
  const status = String(req.query.status ?? 'pending')
  const rows = (
    status === 'all'
      ? await dbAll('SELECT * FROM remote_app_versions ORDER BY submitted_at DESC LIMIT 200')
      : await dbAll(
          'SELECT * FROM remote_app_versions WHERE status = ? ORDER BY submitted_at DESC LIMIT 200',
          [status],
        )
  ) as VersionRow[]
  res.json(rows.map(toDto))
}

/** GET /api/apps/remote/mine — 내가 제출한 것과 그 결과 */
export async function listMySubmissions(req: AuthRequest, res: Response): Promise<void> {
  const rows = (await dbAll(
    'SELECT * FROM remote_app_versions WHERE submitted_by = ? ORDER BY submitted_at DESC LIMIT 100',
    [req.user?.id ?? ''],
  )) as VersionRow[]
  res.json(rows.map(toDto))
}

/** GET /api/apps/remote/versions/:versionId/code — 심사용 코드 열람 (관리자) */
export async function readVersionCode(req: AuthRequest, res: Response): Promise<void> {
  const v = await getVersion(Number(req.params.versionId))
  if (!v) {
    res.status(404).json({ error: '제출된 버전을 찾을 수 없습니다.' })
    return
  }
  const full = bundlePath(v.bundle_name)
  if (!fs.existsSync(full)) {
    res.status(410).json({ error: '번들 파일이 서버에 없습니다.' })
    return
  }
  const code = fs.readFileSync(full, 'utf8')
  res.json({
    version: toDto(v),
    code,
    // 심사자가 어디를 봐야 하는지 알려준다. 차단이 아니라 안내다.
    flags: scanUndeclared(code, parsePermissions(v.permissions)),
  })
}

// ── 심사 ─────────────────────────────────────────────────────────────────────

/** POST /api/apps/remote/versions/:versionId/review — 승인 / 반려 (관리자) */
export async function reviewVersion(req: AuthRequest, res: Response): Promise<void> {
  const v = await getVersion(Number(req.params.versionId))
  if (!v) {
    res.status(404).json({ error: '제출된 버전을 찾을 수 없습니다.' })
    return
  }
  const action = String(req.body?.action ?? '')
  const note = String(req.body?.note ?? '').trim().slice(0, 2000)

  if (action !== 'approve' && action !== 'reject') {
    res.status(400).json({ error: "action 은 'approve' 또는 'reject' 여야 합니다." })
    return
  }
  if (action === 'reject' && !note) {
    res.status(400).json({ error: '반려할 때는 사유를 적어 주세요. 제출자에게 그대로 전달됩니다.' })
    return
  }
  if (v.status === 'approved' && action === 'approve') {
    res.status(409).json({ error: '이미 승인된 버전입니다.' })
    return
  }

  const nextStatus: Status = action === 'approve' ? 'approved' : 'rejected'
  await dbRun(
    `UPDATE remote_app_versions
        SET status = ?, reviewed_by = ?, reviewed_by_name = ?,
            reviewed_at = CURRENT_TIMESTAMP, review_note = ?
      WHERE id = ?`,
    [nextStatus, req.user?.id ?? null, req.user?.email ?? null, note, v.id],
  )

  if (action === 'approve') {
    await publishVersion(v.app_id, v.id)
  } else {
    // 반려된 버전이 지금 배포 중이었다면 내린다.
    const app = await getApp(v.app_id)
    if (app?.current_version_id === v.id) {
      await dbRun('UPDATE remote_apps SET current_version_id = NULL WHERE app_id = ?', [v.app_id])
    }
  }

  res.json({ ok: true, version: toDto((await getVersion(v.id))!) })
}

/**
 * POST /api/apps/remote/:id/suspend — 배포 중단 (관리자)
 *
 * 삭제와 다르다. 코드와 이력을 남긴 채 배포만 멈춘다. 승인 후 문제가 드러났을 때
 * 되돌릴 수 있는 수단이 필요해서 둔다.
 */
export async function suspendApp(req: AuthRequest, res: Response): Promise<void> {
  const live = await getLiveVersion(req.params.id)
  if (!live) {
    res.status(404).json({ error: '배포 중인 버전이 없습니다.' })
    return
  }
  const note = String(req.body?.note ?? '').trim().slice(0, 2000)
  await dbRun(
    `UPDATE remote_app_versions
        SET status = 'suspended', reviewed_by = ?, reviewed_by_name = ?,
            reviewed_at = CURRENT_TIMESTAMP, review_note = ?
      WHERE id = ?`,
    [req.user?.id ?? null, req.user?.email ?? null, note || '관리자가 배포를 정지했습니다.', live.id],
  )
  res.json({ ok: true, id: req.params.id })
}

/** POST /api/apps/remote/:id/resume — 정지 해제 (관리자) */
export async function resumeApp(req: AuthRequest, res: Response): Promise<void> {
  const app = await getApp(req.params.id)
  if (!app?.current_version_id) {
    res.status(404).json({ error: '되돌릴 버전이 없습니다.' })
    return
  }
  const v = await getVersion(app.current_version_id)
  if (!v || v.status !== 'suspended') {
    res.status(409).json({ error: '정지 상태가 아닙니다.' })
    return
  }
  await dbRun(
    `UPDATE remote_app_versions
        SET status = 'approved', reviewed_by = ?, reviewed_by_name = ?,
            reviewed_at = CURRENT_TIMESTAMP, review_note = ?
      WHERE id = ?`,
    [req.user?.id ?? null, req.user?.email ?? null, '정지를 해제했습니다.', v.id],
  )
  await publishVersion(v.app_id, v.id)
  res.json({ ok: true, id: req.params.id })
}

// ── 배포 ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/apps/remote/:id/bundle — 번들 본문 (허브가 동적 import 로 불러감)
 *
 * 기본은 승인된 배포 버전이다. ?versionId= 로 특정 버전을 요청하면
 * 관리자(심사)와 제출자 본인(미리보기)만 받을 수 있다.
 */
export async function getRemoteAppBundle(req: AuthRequest, res: Response): Promise<void> {
  const requested = req.query.versionId ? Number(req.query.versionId) : null

  let row: VersionRow | undefined
  if (requested) {
    row = await getVersion(requested)
    if (!row || row.app_id !== req.params.id) {
      res.status(404).json({ error: '해당 버전을 찾을 수 없습니다.' })
      return
    }
    const mine = Boolean(row.submitted_by) && row.submitted_by === req.user?.id
    if (row.status !== 'approved' && !isAdmin(req) && !mine) {
      res.status(403).json({ error: '아직 승인되지 않은 버전입니다.' })
      return
    }
  } else {
    row = await getLiveVersion(req.params.id)
    if (!row) {
      res.status(404).json({ error: '배포 중인 앱이 아닙니다.' })
      return
    }
  }

  const full = bundlePath(row.bundle_name)
  if (!fs.existsSync(full)) {
    res.status(410).json({ error: '앱 번들이 서버에 없습니다.' })
    return
  }
  res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-App-Sha256', row.sha256)
  res.setHeader('X-App-Version-Id', String(row.id))
  fs.createReadStream(full).pipe(res)
}

/** DELETE /api/apps/remote/:id — 앱과 모든 버전 삭제 (관리자) */
export async function deleteRemoteApp(req: AuthRequest, res: Response): Promise<void> {
  const app = await getApp(req.params.id)
  if (!app) {
    res.status(404).json({ error: '앱을 찾을 수 없습니다.' })
    return
  }
  const versions = (await dbAll('SELECT bundle_name FROM remote_app_versions WHERE app_id = ?', [
    app.app_id,
  ])) as Array<{ bundle_name: string }>
  for (const v of versions) {
    const full = bundlePath(v.bundle_name)
    if (fs.existsSync(full)) fs.unlinkSync(full)
  }
  await dbRun('DELETE FROM remote_app_versions WHERE app_id = ?', [app.app_id])
  await dbRun('DELETE FROM remote_apps WHERE app_id = ?', [app.app_id])
  await dbRun('DELETE FROM published_apps WHERE app_id = ?', [app.app_id])
  res.json({ ok: true, id: app.app_id })
}

// ── 앱 내보내기 / 가져오기 ───────────────────────────────────────────────────
//
// 한 조직에서 만든 앱을 파일 하나로 내보내, 다른 조직이 그대로 가져다 쓸 수 있게 한다.
// 받는 쪽에서도 관리자가 가져오는 것이므로 그 자체가 승인 행위다.

const EXPORT_FORMAT = 'ebs-ai-hub-app'
const EXPORT_FORMAT_VERSION = 1

interface AppExportFile {
  format: string
  formatVersion: number
  exportedAt: string
  app: {
    id: string
    name: string
    icon: string
    description: string
    category: string
    version: string
    author: string | null
    license: string | null
    sourceUrl: string | null
    permissions?: string[]
  }
  sha256: string
  code: string
}

/** GET /api/apps/remote/:id/export — 배포 중인 버전을 파일 하나로 내보낸다 */
export async function exportRemoteApp(req: AuthRequest, res: Response): Promise<void> {
  const row = await getLiveVersion(req.params.id)
  if (!row) {
    res.status(404).json({ error: '배포 중인 앱이 아닙니다. 승인된 버전만 내보낼 수 있습니다.' })
    return
  }
  const full = bundlePath(row.bundle_name)
  if (!fs.existsSync(full)) {
    res.status(410).json({ error: '앱 번들이 서버에 없습니다.' })
    return
  }

  const payload: AppExportFile = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    app: {
      id: row.app_id,
      name: row.name,
      icon: row.icon,
      description: row.description,
      category: row.category,
      version: row.version,
      author: row.author,
      license: row.license,
      sourceUrl: row.source_url,
      permissions: parsePermissions(row.permissions),
    },
    sha256: row.sha256,
    code: fs.readFileSync(full, 'utf8'),
  }

  const fileName = `${row.app_id}-${row.version}.aihubapp.json`
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  res.send(JSON.stringify(payload, null, 2))
}

/** POST /api/apps/remote/import — 내보낸 파일을 가져온다 (관리자, 바로 승인) */
export async function importRemoteApp(req: AuthRequest, res: Response): Promise<void> {
  const file = (req as any).file as Express.Multer.File | undefined
  if (!file) {
    res.status(400).json({ error: '내보낸 앱 파일(.aihubapp.json)이 필요합니다.' })
    return
  }

  let parsed: AppExportFile
  try {
    parsed = JSON.parse(file.buffer.toString('utf8')) as AppExportFile
  } catch {
    res.status(400).json({ error: '앱 파일을 읽을 수 없습니다. JSON 형식이 아닙니다.' })
    return
  }

  if (parsed.format !== EXPORT_FORMAT) {
    res.status(400).json({ error: 'EBS AI HUB 앱 파일이 아닙니다.' })
    return
  }
  if (parsed.formatVersion > EXPORT_FORMAT_VERSION) {
    res.status(400).json({
      error: `이 허브보다 새로운 형식입니다 (v${parsed.formatVersion}). 허브를 업데이트하세요.`,
    })
    return
  }
  if (typeof parsed.code !== 'string') {
    res.status(400).json({ error: '앱 파일에 번들 코드가 없습니다.' })
    return
  }

  const buffer = Buffer.from(parsed.code, 'utf8')
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')
  // 내보낸 쪽이 기록한 해시와 다르면 파일이 손상됐거나 변조된 것이다.
  const tampered = Boolean(parsed.sha256) && parsed.sha256 !== sha256

  const meta = parsed.app ?? ({} as AppExportFile['app'])
  const result = await createVersion(req, {
    appId: (meta.id ?? '').trim().toLowerCase(),
    buffer,
    meta: { ...meta, submitNote: '다른 허브에서 가져온 앱입니다.' },
    autoApprove: true,
  })
  if (result.error) {
    res.status(result.status ?? 400).json({ error: result.error })
    return
  }
  res.status(201).json({ ok: true, app: toDto(result.version!), tampered })
}
