// 앱 번들 빌드 — JSX/최신 문법으로 쓴 소스를 허브가 읽을 수 있는 단일 ESM 한 파일로 만든다.
//
//   npm run build     dist/<앱id>.app.js 생성
//   npm run watch     저장할 때마다 다시 빌드
//   npm run check     제출 전 검증만 (허브 서버가 하는 검사와 같다)
//
// 허브는 번들을 동적 import 하므로 정적 import 가 남아 있으면 안 된다.
// React 도 번들에 넣으면 안 된다 — 인스턴스가 둘이 되어 훅이 깨진다.
// 그래서 호스트가 넘겨주는 React 를 팩토리 인자로 받는다.

import { build, context } from 'esbuild'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(here, 'ebs-app.json'), 'utf8'))
const outFile = join(here, 'dist', `${manifest.id}.app.js`)
// 제출용 파일 하나 — 메타데이터와 코드가 함께 들어 있어 제출 폼을 채울 필요가 없다.
const packageFile = join(here, 'dist', `${manifest.id}.aihubapp.json`)

const mode =
  process.argv.includes('--watch') ? 'watch'
  : process.argv.includes('--check') ? 'check'
  : 'build'

/** 서버가 거부하는 조건을 미리 잡는다. 서버 validateBundle() 과 같은 규칙이다. */
function verify(code) {
  const problems = []
  if (!code.trim()) problems.push('번들이 비어 있습니다.')
  // 서버 validateBundle() 과 같은 규칙 — minify 하면 `export{x as default}` 가 된다.
  if (!/export\s+default\b/.test(code) && !/\bas\s+default\b/.test(code)) {
    problems.push('export default 팩토리가 없습니다.')
  }
  if (/^\s*import\s+[^(]/m.test(code)) {
    problems.push('정적 import 가 남아 있습니다. React 를 번들하지 말고 인자로 받으세요.')
  }
  const MAX = 2 * 1024 * 1024
  if (Buffer.byteLength(code) > MAX) {
    problems.push(`번들이 2MB 를 넘습니다 (${(Buffer.byteLength(code) / 1024 / 1024).toFixed(2)}MB).`)
  }
  return problems
}

/** 매니페스트에 선언한 접근 범위와 실제 코드가 어긋나는지 알려준다. */
function scanPermissions(code) {
  const declared = manifest.permissions ?? []
  const checks = [
    ['network', /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/, '네트워크 호출'],
    ['storage', /\b(localStorage|sessionStorage|indexedDB)\b/, '브라우저 저장소'],
    ['hub-api', /['"`]\/api\//, '허브 API 호출'],
    ['ai', /\/api\/ai\b/, 'AI 게이트웨이'],
    ['clipboard', /navigator\.clipboard/, '클립보드'],
  ]
  return checks
    .filter(([perm, re]) => re.test(code) && !declared.includes(perm))
    .map(([perm, , label]) => `${label} 를 쓰는데 permissions 에 "${perm}" 이 없습니다.`)
}

const options = {
  entryPoints: [join(here, 'src', 'app.jsx')],
  outfile: outFile,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  jsx: 'transform',
  // 호스트가 넘겨주는 React 를 쓴다. 팩토리 안에서 const h = React.createElement 로 받는다.
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  minify: mode === 'build',
  logLevel: 'info',
}

async function run() {
  mkdirSync(dirname(outFile), { recursive: true })

  if (mode === 'watch') {
    const ctx = await context(options)
    await ctx.watch()
    console.log(`감시 중 — ${outFile}`)
    return
  }

  await build(options)
  const code = readFileSync(outFile, 'utf8')

  const problems = verify(code)
  const warnings = scanPermissions(code)

  if (problems.length) {
    console.error('\n제출할 수 없습니다:')
    for (const p of problems) console.error(`  ✗ ${p}`)
    process.exit(1)
  }
  if (warnings.length) {
    console.warn('\n확인해 주세요 (심사에서 지적될 수 있습니다):')
    for (const w of warnings) console.warn(`  ! ${w}`)
  }

  // 제출용 패키지 — 이 파일 하나만 올리면 메타데이터까지 함께 전달된다.
  // 서버가 format 을 보고 안의 app/code 를 꺼내므로 제출 폼을 채울 필요가 없다.
  writeFileSync(
    packageFile,
    JSON.stringify(
      {
        format: 'ebs-ai-hub-app',
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        app: {
          id: manifest.id,
          name: manifest.name,
          icon: manifest.icon,
          description: manifest.description,
          category: manifest.category,
          version: manifest.version,
          author: manifest.author || null,
          license: manifest.license || null,
          sourceUrl: manifest.sourceUrl || null,
          permissions: manifest.permissions ?? [],
        },
        sha256: createHash('sha256').update(code, 'utf8').digest('hex'),
        code,
      },
      null,
      2,
    ),
  )

  console.log(`\n✓ ${(Buffer.byteLength(code) / 1024).toFixed(1)} KB`)
  console.log(`  미리보기용 : ${outFile}`)
  console.log(`  제출용     : ${packageFile}`)
  console.log('\n다음: 마켓플레이스 → «로컬 미리보기»로 확인 → «앱 제출»에 제출용 파일 올리기')
}

run()
