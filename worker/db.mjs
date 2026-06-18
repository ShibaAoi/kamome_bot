import { menuMonths } from './menuData.mjs';

export async function loadMonth(env, month) {
  if (!env.DB) return menuMonths[month] || null;
  const row = await env.DB.prepare('SELECT data_json FROM menu_months WHERE month = ?').bind(month).first();
  return row ? JSON.parse(row.data_json) : (menuMonths[month] || null);
}

export async function saveImport(env, record) {
  await env.DB.prepare(`
    INSERT INTO imports (id, candidate_json, created_by, original_file_name, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    record.id,
    JSON.stringify(record.candidate),
    record.createdBy,
    record.originalFileName,
    record.createdAt,
    record.expiresAt,
  ).run();
}

export async function loadImport(env, id, now = Date.now()) {
  await env.DB.prepare('DELETE FROM imports WHERE expires_at <= ?').bind(now).run();
  const row = await env.DB.prepare('SELECT * FROM imports WHERE id = ?').bind(id).first();
  if (!row) return null;
  return {
    id: row.id,
    candidate: JSON.parse(row.candidate_json),
    createdBy: row.created_by,
    originalFileName: row.original_file_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function cancelImport(env, id) {
  return env.DB.batch([
    env.DB.prepare('DELETE FROM imports WHERE id = ?').bind(id),
    env.DB.prepare('DELETE FROM ocr_jobs WHERE id = ?').bind(id),
  ]);
}

export async function confirmImport(env, record, now = Date.now()) {
  const current = await loadMonth(env, record.candidate.month);
  const statements = [];
  if (current) {
    statements.push(env.DB.prepare(`
      INSERT INTO menu_backups (month, data_json, created_at) VALUES (?, ?, ?)
    `).bind(record.candidate.month, JSON.stringify(current), now));
  }
  statements.push(env.DB.prepare(`
    INSERT INTO menu_months (month, data_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(month) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
  `).bind(record.candidate.month, JSON.stringify(record.candidate), now));
  statements.push(env.DB.prepare('DELETE FROM imports WHERE id = ?').bind(record.id));
  await env.DB.batch(statements);
  return { backupCreated: Boolean(current) };
}

export async function enqueueOcrJob(env, job) {
  await env.DB.prepare(`
    INSERT INTO ocr_jobs (
      id, attachment_url, content_type, original_file_name, month, location,
      created_by, status, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)
  `).bind(
    job.id, job.attachmentUrl, job.contentType, job.originalFileName,
    job.month, job.location, job.createdBy, job.createdAt, job.expiresAt,
  ).run();
}

export async function loadOcrJob(env, id) {
  return env.DB.prepare(`
    SELECT id, status, error, month, created_at, expires_at FROM ocr_jobs WHERE id = ?
  `).bind(id).first();
}

export async function claimOcrJob(env, now = Date.now()) {
  await env.DB.prepare(`
    UPDATE ocr_jobs SET status = 'failed', error = 'OCR処理の有効期限が切れました。', completed_at = ?
    WHERE status IN ('queued', 'processing') AND expires_at <= ?
  `).bind(now, now).run();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await env.DB.prepare(`
      SELECT * FROM ocr_jobs WHERE status = 'queued' AND expires_at > ? ORDER BY created_at LIMIT 1
    `).bind(now).first();
    if (!row) return null;
    const claimed = await env.DB.prepare(`
      UPDATE ocr_jobs SET status = 'processing', claimed_at = ? WHERE id = ? AND status = 'queued'
    `).bind(now, row.id).run();
    if (claimed.meta?.changes === 1) {
      return {
        id: row.id,
        attachmentUrl: row.attachment_url,
        contentType: row.content_type,
        originalFileName: row.original_file_name,
        month: row.month,
        location: row.location,
        createdBy: row.created_by,
        expiresAt: row.expires_at,
      };
    }
  }
  return null;
}

export async function completeOcrJob(env, job, candidate, rawText, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO imports (id, candidate_json, created_by, original_file_name, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET candidate_json = excluded.candidate_json, expires_at = excluded.expires_at
    `).bind(job.id, JSON.stringify(candidate), job.createdBy, job.originalFileName, now, job.expiresAt),
    env.DB.prepare(`
      UPDATE ocr_jobs SET status = 'completed', raw_text = ?, error = NULL, completed_at = ? WHERE id = ?
    `).bind(rawText, now, job.id),
  ]);
}

export async function failOcrJob(env, id, error, now = Date.now()) {
  return env.DB.prepare(`
    UPDATE ocr_jobs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?
  `).bind(String(error).slice(0, 1000), now, id).run();
}
