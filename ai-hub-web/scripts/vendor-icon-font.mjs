import fs from 'node:fs/promises'
import path from 'node:path'

const output = path.resolve(import.meta.dirname, '../public/fonts')
const css = await fetch('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=block', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' }, signal: AbortSignal.timeout(15000),
})
if (!css.ok) throw Error('Official icon font stylesheet unavailable')
const match = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/.exec(await css.text())
if (!match) throw Error('Official WOFF2 URL not found')
const font = await fetch(match[1], { signal: AbortSignal.timeout(15000), redirect: 'error' })
if (!font.ok) throw Error('Icon font unavailable')
const bytes = Buffer.from(await font.arrayBuffer())
if (bytes.toString('ascii', 0, 4) !== 'wOF2' || bytes.length > 1024 * 1024) throw Error('Unexpected icon font format or size')
const license = await fetch('https://raw.githubusercontent.com/google/material-design-icons/master/LICENSE', { signal: AbortSignal.timeout(15000) })
if (!license.ok) throw Error('Font license unavailable')
await fs.mkdir(output, { recursive: true })
await fs.writeFile(path.join(output, 'material-symbols-outlined.woff2'), bytes)
await fs.writeFile(path.join(output, 'material-symbols-LICENSE.txt'), await license.text())
console.log(`Vendored official Material Symbols font (${bytes.length} bytes).`)
