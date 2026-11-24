import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../server/package.json', import.meta.url))
const sqlite = require('sqlite3')
const { parse } = require('dotenv')
const root = path.resolve(import.meta.dirname, '..')
const env = parse(fs.readFileSync(path.join(root, 'server/.env')))
const backups = path.join(root, '.runtime/security-backups')
const latest = fs.readdirSync(backups).filter((name) => fs.existsSync(path.join(backups, name, 'counts.json'))).sort().at(-1)
if (!latest) throw new Error('Security backup missing')
const baseline = JSON.parse(fs.readFileSync(path.join(backups, latest, 'counts.json'), 'utf8'))
const db = new sqlite.Database(path.resolve(root, 'server', env.DATABASE_PATH || './data/aihub.db'), sqlite.OPEN_READONLY)
const all = (sql) => new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)))
try {
  const integrity = await all('PRAGMA quick_check')
  if (integrity[0]?.quick_check !== 'ok') throw new Error('Database integrity check failed')
  for (const [name, count] of Object.entries(baseline)) {
    const rows = await all(`SELECT COUNT(*) AS count FROM "${name.replaceAll('"', '""')}"`)
    if (rows[0].count < count) throw new Error(`Table row count decreased: ${name}`)
  }
  console.log(JSON.stringify({ integrity: 'ok', baselineTablesPreserved: Object.keys(baseline).length }))
} finally { await new Promise((resolve) => db.close(resolve)) }
