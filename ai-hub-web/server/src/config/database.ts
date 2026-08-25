import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

const DATABASE_PATH = process.env.DATABASE_PATH || './data/aihub.db';
const dataDir = path.dirname(DATABASE_PATH);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite = sqlite3.verbose();
export const db = new sqlite.Database(DATABASE_PATH);

// Helper function to run queries
export const run = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

// Helper function to get single row
export const get = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Helper function to get all rows
export const all = (sql: string, params: any[] = []): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export const initDatabase = async (): Promise<void> => {
  try {
    await run('PRAGMA foreign_keys = ON');
    
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        login_id TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'user', 'partner')),
        status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
        company TEXT,
        department TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS holidays (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        is_recurring BOOLEAN DEFAULT 0,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT,
        user_id TEXT NOT NULL,
        is_all_day BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS environment_config (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS remote_apps (
        app_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT 'extension',
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '생산성',
        version TEXT NOT NULL DEFAULT '1.0.0',
        author TEXT,
        license TEXT,
        source_url TEXT,
        bundle_name TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        sha256 TEXT NOT NULL DEFAULT '',
        uploaded_by TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS published_apps (
        app_id TEXT PRIMARY KEY,
        published_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── 재물조사 협업 테이블 ────────────────────────────────────────
    await run(`
      CREATE TABLE IF NOT EXISTS inventory_datasets (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        parent_dept TEXT NOT NULL,
        asset_count INTEGER DEFAULT 0,
        assets_json TEXT NOT NULL DEFAULT '[]',
        uploaded_by TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        source TEXT
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS inventory_sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        dataset_id TEXT NOT NULL,
        parent_dept TEXT NOT NULL,
        dept TEXT DEFAULT '',
        created_by TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed INTEGER DEFAULT 0,
        completed_at DATETIME,
        uploaded_at DATETIME,
        results_json TEXT DEFAULT '{}',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS inventory_sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        asset_no TEXT NOT NULL,
        action TEXT NOT NULL,
        user_id TEXT,
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 본부별 ERP 자산현황 원본 — 관리자가 올린 파일을 본부별로 보관한다.
    // 현장 앱이 이 파일을 자동으로 받아 쓰기 때문에, 폰에서 따로 올릴 필요가 없다.
    await run(`
      CREATE TABLE IF NOT EXISTS inventory_erp_files (
        parent_dept TEXT PRIMARY KEY,
        id TEXT NOT NULL,
        dataset_id TEXT,
        file_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        uploaded_by TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 운영관리부 전사 자산현황 양식 — 업로드한 원본을 영속 보관한다.
    // (예전에는 서버 메모리 캐시 2시간이라 새로고침·서버 재시작이면 사라졌다)
    await run(`
      CREATE TABLE IF NOT EXISTS inventory_survey_forms (
        id TEXT PRIMARY KEY,
        file_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        sheet_names TEXT NOT NULL DEFAULT '[]',
        size INTEGER NOT NULL DEFAULT 0,
        uploaded_by TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 재물조사 산출물 파일 (검수 반영 ERP 파일 / 운영관리부 설치부서 대조 파일)
    // 파일 본문은 uploads/inventory 아래 디스크에 두고 여기에는 메타데이터만 둔다.
    await run(`
      CREATE TABLE IF NOT EXISTS inventory_files (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK(kind IN ('erp-inspection', 'dept-comparison')),
        parent_dept TEXT NOT NULL DEFAULT '',
        session_id TEXT,
        file_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        summary TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run('CREATE INDEX IF NOT EXISTS idx_inv_sessions_updated ON inventory_sessions(updated_at)');
    await run('CREATE INDEX IF NOT EXISTS idx_inv_files_created ON inventory_files(created_at)');
    await run('CREATE INDEX IF NOT EXISTS idx_inv_sync_session ON inventory_sync_log(session_id, synced_at)');

    // ── 모바일 기기 페어링 테이블 ──────────────────────────────────────
    await run(`
      CREATE TABLE IF NOT EXISTS device_pairs (
        id TEXT PRIMARY KEY,
        device_name TEXT NOT NULL,
        user_name TEXT NOT NULL,
        department TEXT DEFAULT '',
        pair_code TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
        user_id TEXT,
        approved_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_at DATETIME,
        last_seen_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (approved_by) REFERENCES users(id)
      )
    `);
    await run('CREATE INDEX IF NOT EXISTS idx_device_pairs_code ON device_pairs(pair_code)');
    await run('CREATE INDEX IF NOT EXISTS idx_device_pairs_status ON device_pairs(status)');
    // ─────────────────────────────────────────────────────────────────

    await run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    await run('CREATE INDEX IF NOT EXISTS idx_users_login_id ON users(login_id)');

    logger.info('Database schema initialized');
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  }
};

// Made with Bob
