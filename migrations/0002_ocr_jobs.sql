CREATE TABLE IF NOT EXISTS ocr_jobs (
  id TEXT PRIMARY KEY,
  attachment_url TEXT NOT NULL,
  content_type TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  month TEXT NOT NULL,
  location TEXT NOT NULL,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  error TEXT,
  raw_text TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  claimed_at INTEGER,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ocr_jobs_queue ON ocr_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ocr_jobs_expires_at ON ocr_jobs(expires_at);
