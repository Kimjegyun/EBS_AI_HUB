import { spawn } from 'child_process'
import path from 'path'

type Action = 'check' | 'build' | 'submit'
interface Job {
  action: Action
  status: 'running' | 'completed' | 'failed'
  startedAt: string
  finishedAt?: string
  results: Array<{ folder: string; id?: string; version?: string; status: string; error?: string }>
  error?: string
}

let job: Job | null = null
export const getImportJob = () => job

/** Fixed script and arguments only; the browser cannot select paths or commands. */
export function startImportJob(action: Action, token: string): Job {
  if (job?.status === 'running') throw new Error('IMPORT_BUSY')
  const root = path.resolve(__dirname, '../../..')
  const current: Job = { action, status: 'running', startedAt: new Date().toISOString(), results: [] }
  job = current
  const args = action === 'check' ? ['--check'] : action === 'submit' ? ['--submit'] : []
  const child = spawn(process.execPath, [path.join(root, 'scripts/import-programs.mjs'), ...args], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AIHUB_IMPORT_API_URL: `http://127.0.0.1:${process.env.PORT || 3001}`, AIHUB_IMPORT_TOKEN: action === 'submit' ? token : '' },
  })
  let stdout = ''
  let stderr = ''
  const finish = (error?: string) => {
    if (current.status !== 'running') return
    clearTimeout(timer)
    current.finishedAt = new Date().toISOString()
    current.status = error ? 'failed' : 'completed'
    current.error = error
  }
  const timer = setTimeout(() => {
    child.kill()
    finish('처리 제한 시간(5분)을 초과했습니다. 제출 목록을 확인한 후 다시 실행하세요.')
  }, 5 * 60 * 1000)
  child.stdout.on('data', (data: Buffer) => {
    stdout += data.toString()
    if (stdout.length > 1024 * 1024) { child.kill(); finish('결과 크기 제한을 초과했습니다.') }
  })
  child.stderr.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-4000) })
  child.on('error', () => finish('파이프라인 프로세스를 시작하지 못했습니다. 서버 설치 상태를 확인하세요.'))
  child.on('close', (code) => {
    if (current.status !== 'running') return
    try {
      const results: unknown = JSON.parse(stdout)
      if (!Array.isArray(results)) throw new Error('Invalid result')
      current.results = results
      finish(code === 0 ? undefined : '일부 폴더 처리에 실패했습니다. 아래 결과를 확인하세요.')
    } catch {
      finish(stderr ? '파이프라인 실행에 실패했습니다. 소스 폴더와 서버 파일 접근 권한을 확인하세요.' : '파이프라인 결과를 읽지 못했습니다.')
    }
  })
  return current
}
