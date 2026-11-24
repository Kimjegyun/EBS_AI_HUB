import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../server/package.json', import.meta.url))
const sqlite = require('sqlite3')
const { parse } = require('dotenv')
const root = path.resolve(import.meta.dirname, '..')
const env = parse(fs.readFileSync(path.join(root, 'server/.env')))
const source = path.resolve(root, 'server', env.DATABASE_PATH || './data/aihub.db')
const output = path.join(root, '.runtime/security-backups', new Date().toISOString().replace(/[:.]/g, '-'))
fs.mkdirSync(output, { recursive: true })
const db = new sqlite.Database(source, sqlite.OPEN_READONLY)
db.configure('busyTimeout', 10000)
const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, (error) => error ? reject(error) : resolve()))
const all = (sql) => new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)))
try {
  await run('VACUUM INTO ?', [path.join(output, 'aihub.db')])
  const integrity = await all('PRAGMA quick_check')
  if (integrity[0]?.quick_check !== 'ok') throw new Error('Database integrity check failed')
  const counts = {}
  const tables = await all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  for (const { name } of tables) counts[name] = (await all(`SELECT COUNT(*) AS count FROM "${name.replaceAll('"', '""')}"`))[0].count
  fs.writeFileSync(path.join(output, 'counts.json'), JSON.stringify(counts, null, 2))
  console.log(JSON.stringify({ backup: output, integrity: 'ok', tables: tables.length }))
} finally { await new Promise((resolve) => db.close(resolve)) }
