import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import path from 'node:path'

const caRoot = path.join(homedir(), '.vite-plugin-mkcert')
const mkcert = path.join(caRoot, process.platform === 'win32' ? 'mkcert.exe' : 'mkcert')

const result = spawnSync(mkcert, ['-install'], {
  env: { ...process.env, CAROOT: caRoot },
  stdio: 'inherit',
  windowsHide: false,
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
