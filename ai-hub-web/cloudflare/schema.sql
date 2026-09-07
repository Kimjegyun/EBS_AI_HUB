PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  parent_dept TEXT NOT NULL,
  asset_count INTEGER NOT NULL DEFAULT 0,
  assets_json TEXT NOT NULL DEFAULT '[]',
  source TEXT,
  erp_file_id TEXT,
  uploaded_by TEXT,
  uploaded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_files (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  parent_dept TEXT NOT NULL DEFAULT '',
  dataset_id TEXT,
  session_id TEXT,
  sheet_names_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  parent_dept TEXT NOT NULL,
  dept TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS survey_results (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  asset_no TEXT NOT NULL,
  verifier TEXT NOT NULL,
  verifier_dept TEXT NOT NULL DEFAULT '',
  result_json TEXT NOT NULL,
  surveyed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(session_id, asset_no)
);

CREATE TABLE IF NOT EXISTS result_conflicts (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  asset_no TEXT NOT NULL,
  winning_result_id TEXT NOT NULL,
  duplicate_result_json TEXT NOT NULL,
  duplicate_verifier TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_dataset ON sessions(dataset_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_results_dataset_asset ON survey_results(dataset_id, asset_no);
CREATE INDEX IF NOT EXISTS idx_conflicts_dataset ON result_conflicts(dataset_id, resolved);
CREATE INDEX IF NOT EXISTS idx_files_kind ON inventory_files(kind, created_at);
