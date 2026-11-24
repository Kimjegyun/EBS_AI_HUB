import { readFile, writeFile, mkdir, readdir, realpath, rename } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const permissions = ['network', 'storage', 'hub-api', 'ai', 'clipboard']
const digest = (value) => createHash('sha256').update(value).digest('hex')

export function validateManifest(m) {
  if (!m || typeof m.id !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(m.id)) throw new Error('유효한 앱 id가 필요합니다.')
  if (typeof m.name !== 'string' || !m.name.trim()) throw new Error('앱 이름이 필요합니다.')
  if (typeof m.version !== 'string' || !/^[0-9A-Za-z][0-9A-Za-z.\-+]{0,31}$/.test(m.version)) throw new Error('유효한 version이 필요합니다.')
  if (!['생산성', '운영', 'AI'].includes(m.category)) throw new Error('category: 생산성, 운영, AI 중 선택하세요.')
  if (typeof m.entry !== 'string' || !m.entry) throw new Error('앱 팩토리 entry가 필요합니다.')
  if (!Array.isArray(m.permissions) || m.permissions.some((p) => !permissions.includes(p))) throw new Error('permissions 배열을 확인하세요.')
  return m
}

export async function containedFile(folder, entry) {
  const base = await realpath(folder)
  const target = await realpath(path.resolve(base, entry))
  const relative = path.relative(base, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('프로그램 폴더 밖의 파일은 사용할 수 없습니다.')
  return target
}

export async function packageProgram(folder) {
  const manifest = validateManifest(JSON.parse(await readFile(path.join(folder, 'aihub-app.json'), 'utf8')))
  const entry = await containedFile(folder, manifest.entry)
  const output = await build({
    configFile: false, envDir: false, root: folder, publicDir: false, logLevel: 'error',
    css: { postcss: { plugins: [] } },
    plugins: [{
      name: 'aihub-import-boundary',
      async load(id) {
        if (id.startsWith('\0')) return null
        const file = id.split('?')[0]
        if (path.isAbsolute(file)) {
          await containedFile(folder, file)
          if (/\.(env|pem|key)$|(?:^|[/\\])\.env(?:\.|$)/i.test(file)) throw new Error('비밀 설정 파일은 번들에 포함할 수 없습니다.')
        }
        return null
      },
    }],
    build: {
      write: false, minify: false, sourcemap: false,
      lib: { entry, formats: ['es'], fileName: 'app' },
      rolldownOptions: { output: { codeSplitting: false } },
    },
  })
  const files = (Array.isArray(output) ? output : [output]).flatMap((r) => r.output)
  if (files.length !== 1 || files[0].type !== 'chunk') throw new Error('단일 JS 번들이 필요합니다. CSS/이미지는 인라인으로 처리하세요.')
  const code = files[0].code
  if (!files[0].exports.includes('default') || files[0].imports.length || files[0].dynamicImports.length) throw new Error('외부 import 없는 default 앱 팩토리가 필요합니다.')
  const app = Object.fromEntries(['id', 'name', 'version', 'category', 'description', 'icon', 'author', 'license', 'sourceUrl', 'permissions'].map((key) => [key, manifest[key]]))
  const pkg = { format: 'ebs-ai-hub-app', formatVersion: 1, app, sha256: digest(code), code }
  const text = JSON.stringify(pkg, null, 2)
  if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error('패키지가 업로드 한도 2MB를 초과합니다.')
  return { pkg, text }
}

async function atomicJson(file, text) {
  await writeFile(`${file}.tmp`, text)
  await rename(`${file}.tmp`, file)
}

export async function runPipeline({ input = path.join(root, 'import_program'), output = path.join(input, '.packages'), check = false, submit = false, apiUrl = process.env.AIHUB_IMPORT_API_URL, token = process.env.AIHUB_IMPORT_TOKEN } = {}) {
  if (submit) {
    if (!apiUrl || !token) throw new Error('제출에는 AIHUB_IMPORT_API_URL과 AIHUB_IMPORT_TOKEN이 필요합니다.')
    const url = new URL(apiUrl)
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('API 주소는 HTTPS 또는 localhost HTTP여야 합니다.')
  }
  await mkdir(output, { recursive: true })
  const stateFile = path.join(output, 'state.json')
  let state = {}
  try { state = JSON.parse(await readFile(stateFile, 'utf8')) } catch (e) { if (e.code !== 'ENOENT') throw e }
  const results = []
  const ids = new Set()
  for (const item of await readdir(input, { withFileTypes: true })) {
    if (!item.isDirectory() || item.name.startsWith('.')) continue
    try {
      if (check) {
        const folder = path.join(input, item.name)
        const manifest = validateManifest(JSON.parse(await readFile(path.join(folder, 'aihub-app.json'), 'utf8')))
        await containedFile(folder, manifest.entry)
        if (ids.has(manifest.id)) throw new Error(`중복 앱 id: ${manifest.id}`)
        ids.add(manifest.id)
        results.push({ folder: item.name, id: manifest.id, version: manifest.version, status: 'checked' })
        continue
      }
      const { pkg, text } = await packageProgram(path.join(input, item.name))
      if (ids.has(pkg.app.id)) throw new Error(`중복 앱 id: ${pkg.app.id}`)
      ids.add(pkg.app.id)
      const filename = `${pkg.app.id}@${pkg.app.version}.aihubapp.json`
      await atomicJson(path.join(output, filename), text)
      const key = digest(`${apiUrl}\n${pkg.app.id}\n${pkg.app.version}`)
      const hash = digest(text)
      let status = 'packaged'
      if (submit && state[key]?.hash === hash) status = 'already-submitted'
      else if (submit) {
        const form = new FormData()
        form.append('bundle', new Blob([text], { type: 'application/json' }), filename)
        const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/apps/remote/submit`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
          redirect: 'error', signal: AbortSignal.timeout(30000),
        })
        if (!response.ok) throw new Error(`심사 제출 실패 (HTTP ${response.status}). 내 제출 목록을 확인하세요.`)
        const receipt = await response.json()
        state[key] = { hash, versionId: receipt.version?.versionId, submittedAt: new Date().toISOString() }
        await atomicJson(stateFile, JSON.stringify(state, null, 2))
        status = 'pending-review'
      }
      results.push({ folder: item.name, id: pkg.app.id, version: pkg.app.version, status, filename })
    } catch (e) {
      results.push({ folder: item.name, status: 'failed', error: e.message })
    }
  }
  await atomicJson(path.join(output, 'report.json'), JSON.stringify(results, null, 2))
  return results
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.some((a) => !['--submit', '--watch', '--check'].includes(a))) throw new Error('지원 옵션: --submit --watch --check')
  const run = async () => {
    try {
      const results = await runPipeline({ submit: args.includes('--submit'), check: args.includes('--check') })
      console.log(JSON.stringify(results, null, 2))
      process.exitCode = results.some((r) => r.status === 'failed') ? 1 : 0
    } catch (e) { console.error(e.message); process.exitCode = 1 }
  }
  await run()
  if (args.includes('--watch')) {
    // 순차 폴링: 파일 복사 중 실패해도 다음 회차에 다시 빌드한다.
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 5000))
      await run()
    }
  }
}
