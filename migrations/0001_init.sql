CREATE TABLE IF NOT EXISTS menu_months (
  month TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  candidate_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  original_file_name TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_imports_expires_at ON imports(expires_at);
CREATE INDEX IF NOT EXISTS idx_menu_backups_month ON menu_backups(month, created_at DESC);
