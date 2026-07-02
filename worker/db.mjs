import { menuMonths } from './menuData.mjs';

export async function loadMonth(env, month) {
  if (!env.DB) return menuMonths[month] || null;
  const row = await env.DB.prepare('SELECT data_json FROM menu_months WHERE month = ?').bind(month).first();
  return row ? JSON.parse(row.data_json) : (menuMonths[month] || null);
}

export async function saveMonth(env, candidate, now = Date.now()) {
  const current = await loadMonth(env, candidate.month);
  const statements = [];
  if (current) {
    statements.push(env.DB.prepare(`
      INSERT INTO menu_backups (month, data_json, created_at) VALUES (?, ?, ?)
    `).bind(candidate.month, JSON.stringify(current), now));
  }
  statements.push(env.DB.prepare(`
    INSERT INTO menu_months (month, data_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(month) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
  `).bind(candidate.month, JSON.stringify(candidate), now));
  await env.DB.batch(statements);
  return { backupCreated: Boolean(current) };
}

function scheduleFromRow(row) {
  if (!row) return null;
  return {
    guildId: row.guild_id,
    channelId: row.channel_id,
    postTime: row.post_time,
    timezone: row.timezone,
    enabled: row.enabled === 1,
    lastPostDate: row.last_post_date,
    lastError: row.last_error,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export async function saveMenuSchedule(env, schedule) {
  await env.DB.prepare(`
    INSERT INTO menu_schedules (
      guild_id, channel_id, post_time, timezone, enabled,
      last_post_date, last_error, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, 1, NULL, NULL, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id = excluded.channel_id,
      post_time = excluded.post_time,
      timezone = excluded.timezone,
      enabled = 1,
      last_error = NULL,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).bind(
    schedule.guildId,
    schedule.channelId,
    schedule.postTime,
    schedule.timezone,
    schedule.updatedBy,
    schedule.updatedAt,
  ).run();
}

export async function loadMenuSchedule(env, guildId) {
  const row = await env.DB.prepare('SELECT * FROM menu_schedules WHERE guild_id = ?').bind(guildId).first();
  return scheduleFromRow(row);
}

export async function disableMenuSchedule(env, guildId, updatedBy, updatedAt) {
  await env.DB.prepare(`
    UPDATE menu_schedules
    SET enabled = 0, updated_by = ?, updated_at = ?
    WHERE guild_id = ?
  `).bind(updatedBy, updatedAt, guildId).run();
}

export async function listDueMenuSchedules(env, postTime, postDate) {
  const { results } = await env.DB.prepare(`
    SELECT * FROM menu_schedules
    WHERE enabled = 1
      AND post_time = ?
      AND (last_post_date IS NULL OR last_post_date <> ?)
    ORDER BY updated_at
  `).bind(postTime, postDate).all();
  return (results || []).map(scheduleFromRow);
}

export async function markMenuSchedulePosted(env, guildId, postDate, updatedAt) {
  await env.DB.prepare(`
    UPDATE menu_schedules
    SET last_post_date = ?, last_error = NULL, updated_at = ?
    WHERE guild_id = ?
  `).bind(postDate, updatedAt, guildId).run();
}

export async function markMenuScheduleError(env, guildId, error, updatedAt) {
  await env.DB.prepare(`
    UPDATE menu_schedules
    SET last_error = ?, updated_at = ?
    WHERE guild_id = ?
  `).bind(String(error).slice(0, 1000), updatedAt, guildId).run();
}
