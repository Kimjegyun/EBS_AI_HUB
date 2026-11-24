import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifestPath = path.join(root, 'aihub-app.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const entryPath = path.resolve(root, manifest.entry ?? '')
const relativeEntry = path.relative(root, entryPath)
if (!manifest.entry || relativeEntry.startsWith('..') || path.isAbsolute(relativeEntry)) throw Error('entry는 앱 폴더 안의 파일이어야 합니다.')
const code = await readFile(entryPath, 'utf8')

if (!/^[a-z][a-z0-9-]{1,63}$/.test(manifest.id ?? '')) throw Error('id는 소문자 영문으로 시작하고 소문자·숫자·하이픈 2~64자여야 합니다.')
if (!manifest.name?.trim()) throw Error('name을 입력하세요.')
if (!/^[0-9A-Za-z][0-9A-Za-z.\-+]{0,31}$/.test(manifest.version ?? '')) throw Error('version 형식이 올바르지 않습니다.')
if (!['생산성', '운영', 'AI'].includes(manifest.category)) throw Error('category는 생산성, 운영, AI 중 하나여야 합니다.')
if (!Array.isArray(manifest.permissions) || manifest.permissions.some((p) => !['network', 'storage', 'hub-api', 'ai', 'clipboard'].includes(p))) throw Error('permissions 값을 확인하세요.')
if (!/export\s+default\b/.test(code)) throw Error('app.js에 export default 앱 팩토리가 필요합니다.')
if (/^\s*import\s+/m.test(code) || /\bimport\s*\(/.test(code)) throw Error('import는 지원되지 않습니다. 앱을 단일 파일로 작성하세요.')

const app = Object.fromEntries(['id', 'name', 'version', 'category', 'description', 'icon', 'author', 'license', 'sourceUrl', 'permissions'].map((key) => [key, manifest[key]]))
const pkg = { format: 'ebs-ai-hub-app', formatVersion: 1, app, sha256: createHash('sha256').update(code).digest('hex'), code }
const outputDir = path.join(root, 'dist')
const outputPath = path.join(outputDir, `${manifest.id}@${manifest.version}.aihubapp.json`)
await mkdir(outputDir, { recursive: true })
const output = JSON.stringify(pkg, null, 2)
if (Buffer.byteLength(output) > 2 * 1024 * 1024) throw Error('패키지가 2MB 한도를 초과합니다.')
await writeFile(outputPath, output, 'utf8')
console.log(`Created ${path.relative(root, outputPath)} (${Buffer.byteLength(output)} bytes)`)
