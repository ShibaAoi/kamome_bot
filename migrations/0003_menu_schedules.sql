CREATE TABLE IF NOT EXISTS menu_schedules (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  post_time TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_post_date TEXT,
  last_error TEXT,
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_menu_schedules_due ON menu_schedules(enabled, post_time, last_post_date);
