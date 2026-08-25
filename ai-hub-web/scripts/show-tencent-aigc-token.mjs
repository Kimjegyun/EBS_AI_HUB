import { createRequire } from 'node:module'
import path from 'node:path'
import { existsSync } from 'node:fs'

const DB_PATH = path.resolve('server/data/aihub.db')

function readRow() {
  return new Promise((resolve, reject) => {
    if (!existsSync(DB_PATH)) {
      reject(new Error('로컬 DB가 없습니다. 서버를 한 번 실행한 뒤 다시 시도하세요.'))
      return
    }
    const require = createRequire(path.resolve('server/package.json'))
    const sqlite3 = require('sqlite3')
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY)
    db.get('SELECT data FROM environment_config WHERE id = ?', ['default'], (err, row) => {
      db.close()
      if (err) reject(err)
      else resolve(row)
    })
  })
}

function pickToken(data) {
  const app = data?.ai_app_settings?.['my-llm']
  const fromApp = typeof app?.ai_tencent_api_key === 'string' ? app.ai_tencent_api_key.trim() : ''
  const fromRoot = typeof data?.ai_tencent_api_key === 'string' ? data.ai_tencent_api_key.trim() : ''
  return fromApp || fromRoot
}

const row = await readRow().catch((err) => {
  console.error(err instanceof Error ? err.message : 'DB를 읽지 못했습니다.')
  process.exit(1)
})

let data = {}
try {
  data = JSON.parse(row?.data || '{}')
} catch {
  data = {}
}

const token = pickToken(data)
if (!token) {
  console.error('저장된 ApiToken이 없습니다. 먼저 npm run tencent:create-token 또는 ADMIN에서 발급하세요.')
  process.exit(1)
}

console.log(token)
