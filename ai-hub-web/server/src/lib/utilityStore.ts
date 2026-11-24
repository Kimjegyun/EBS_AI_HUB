import fs from 'node:fs/promises'
import path from 'node:path'
import { createReadStream } from 'node:fs'
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto'
import { all, db, get, run } from '../config/database'

export async function initUtilityStore() {
  await run(`CREATE TABLE IF NOT EXISTS utility_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    version TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    category TEXT NOT NULL,
    features TEXT NOT NULL,
    usage TEXT NOT NULL,
    changes TEXT NOT NULL,
    launch_url TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(slug, version)
  )`)
}

export function validateUtility(input: Record<string, unknown>) {
  const limits: Record<string, number> = { slug: 64, version: 32, title: 120, summary: 500, category: 40, features: 20000, usage: 30000, changes: 10000, launchUrl: 2000 }
  const result: Record<string, string> = {}
  for (const [key, max] of Object.entries(limits)) {
    const value = input[key] ?? ''
    if (typeof value !== 'string' || value.trim().length > max) throw new Error(`${key} 입력 길이와 형식을 확인하세요.`)
    result[key] = value.trim()
  }
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(result.slug)) throw new Error('주소 ID는 영문 소문자로 시작하는 2~64자의 영문·숫자·하이픈으로 입력하세요.')
  if (!/^[0-9A-Za-z][0-9A-Za-z.\-+]{0,31}$/.test(result.version)) throw new Error('버전 형식을 확인하세요.')
  for (const key of ['title', 'summary', 'category', 'features', 'usage', 'changes']) if (!result[key]) throw new Error('제목·소개·분류·특징·사용법·변경 내용은 필수입니다.')
  if (result.launchUrl) {
    const url = new URL(result.launchUrl, 'https://ebs-aihub.com')
    if (url.protocol !== 'https:' || url.username || url.password || result.launchUrl.startsWith('//') || result.launchUrl.includes('\\')) throw new Error('실행 주소는 /로 시작하는 내부 경로 또는 HTTPS 주소를 입력하세요.')
    if (!result.launchUrl.startsWith('/') && !result.launchUrl.startsWith('https://')) throw new Error('실행 주소를 확인하세요.')
  }
  return result
}

export async function listUtilities() {
  return all(`SELECT id, slug, version, title, summary, category, created_at AS createdAt
    FROM utility_revisions WHERE id IN (SELECT MAX(id) FROM utility_revisions GROUP BY slug)
    ORDER BY id DESC`)
}

export async function utilityHistory(slug: string) {
  return all(`SELECT id, slug, version, title, summary, category, features, usage, changes,
    launch_url AS launchUrl, author, created_at AS createdAt
    FROM utility_revisions WHERE slug = ? ORDER BY id DESC`, [slug])
}

export async function publishUtility(input: Record<string, unknown>, author: string) {
  const m = validateUtility(input)
  await run('BEGIN IMMEDIATE')
  try {
    if (await get('SELECT id FROM utility_revisions WHERE slug = ? AND version = ?', [m.slug, m.version])) {
      throw new Error('이미 발행된 버전입니다. 새 버전 번호를 입력하세요.')
    }
    // EBS Viewer distributes only the current installer; its previous library revisions are not needed.
    if (m.slug === 'ebs-viewer') await run('DELETE FROM utility_revisions WHERE slug = ?', [m.slug])
    await run(`INSERT INTO utility_revisions
      (slug, version, title, summary, category, features, usage, changes, launch_url, author)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [m.slug, m.version, m.title, m.summary, m.category, m.features, m.usage, m.changes, m.launchUrl, author])
    await run('COMMIT')
  } catch (error) {
    await run('ROLLBACK').catch(() => undefined)
    throw error
  }
  if (m.slug === 'ebs-viewer') await prunePreviousEbsViewerAssets(m.version)
  return utilityHistory(m.slug)
}

export async function prunePreviousEbsViewerAssets(currentVersion: string) {
  if (!/^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/.test(currentVersion)) throw new Error('버전 형식이 올바르지 않습니다.')
  const filesRoot = process.env.UTILITY_FILES_DIR
    ? path.resolve(process.env.UTILITY_FILES_DIR)
    : path.resolve(__dirname, '../../../.utility-files')
  const downloadsDir = path.join(filesRoot, 'downloads')
  const versionPath = path.join(filesRoot, 'version.json')
  const macPath = path.join(filesRoot, 'mac.json')
  let versionInfo: { version?: string; download?: string; file?: string; sha256?: string; size?: number; notes?: string[]; signature?: string }
  let macInfo: { version?: string; notarized?: boolean; files?: Array<{ arch?: string; file?: string; sha256?: string; size?: number }> }
  try {
    versionInfo = JSON.parse(await fs.readFile(versionPath, 'utf8'))
    macInfo = JSON.parse(await fs.readFile(macPath, 'utf8'))
  } catch {
    return
  }
  if (versionInfo.version !== currentVersion || macInfo.version !== currentVersion || macInfo.notarized !== true || !versionInfo.file ||
      !versionInfo.download || !versionInfo.sha256 || !versionInfo.signature || !Array.isArray(macInfo.files)) return

  const macByArch = new Map(macInfo.files.map((file) => [file.arch, file]))
  const arm = macByArch.get('arm64')
  const intel = macByArch.get('x64')
  if (macInfo.files.length !== 2 || !arm?.file || !arm.sha256 || !Number.isSafeInteger(arm.size) ||
      !intel?.file || !intel.sha256 || !Number.isSafeInteger(intel.size)) return
  const currentFiles = [versionInfo.file, arm.file, intel.file]
  if (currentFiles.some((file) => path.basename(file) !== file) || !/^EBSViewer_Setup_[0-9A-Za-z][0-9A-Za-z.+-]{0,31}\.exe$/i.test(versionInfo.file)) return

  const publicBytes = Buffer.from('4VY8WCsoOCl5gdKOz29Rkxy0WYlZpjGvxnwoANbfMScct8VA8psduoLrqLsrxASojJHq3nBE//Z4M4qMnbnAuA==', 'base64')
  if (publicBytes.length !== 64) return
  const publicKey = createPublicKey({
    key: {
      kty: 'EC', crv: 'P-256',
      x: publicBytes.subarray(0, 32).toString('base64url'),
      y: publicBytes.subarray(32).toString('base64url'),
    },
    format: 'jwk',
  })
  const b64 = (value: string) => Buffer.from(value, 'utf8').toString('base64')
  const signedText = [
    'EBSViewer-update-manifest-v1',
    `version=${b64(versionInfo.version)}`,
    `download=${b64(versionInfo.download)}`,
    `sha256=${b64(versionInfo.sha256.toLowerCase())}`,
    ...(versionInfo.notes ?? []).map((note) => `note=${b64(note ?? '')}`),
    '',
  ].join('\n')
  const signature = Buffer.from(versionInfo.signature, 'base64')
  if (signature.length !== 64 || !verifySignature('sha256', Buffer.from(signedText), { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature)) return

  const checks = [
    { file: versionInfo.file, sha256: versionInfo.sha256.toLowerCase(), size: versionInfo.size },
    { file: arm.file, sha256: arm.sha256.toLowerCase(), size: arm.size },
    { file: intel.file, sha256: intel.sha256.toLowerCase(), size: intel.size },
  ]
  for (const check of checks) {
    if (!/^[0-9a-f]{64}$/.test(check.sha256) || !Number.isSafeInteger(check.size)) return
    const filePath = path.join(downloadsDir, check.file)
    try {
      const stat = await fs.lstat(filePath)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== check.size) return
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(filePath)) hash.update(chunk)
      if (hash.digest('hex') !== check.sha256) return
    } catch {
      return
    }
  }

  const entries = await fs.readdir(downloadsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const match = entry.name.match(/^EBSViewer_(?:Setup_)?([0-9A-Za-z][0-9A-Za-z.+-]{0,31})(?:_mac_(?:arm64|x64))?\.(?:exe|zip)$/i)
    if (!match || match[1] === currentVersion || currentFiles.includes(entry.name)) continue
    await fs.unlink(path.join(downloadsDir, entry.name))
  }
  await fs.unlink(path.join(filesRoot, 'install-mac.sh')).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  })
}
