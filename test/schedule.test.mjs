import test from 'node:test';
import assert from 'node:assert/strict';
import { handleInteraction, handleScheduledMenus } from '../worker/index.mjs';

function createScheduleDb() {
  const schedules = new Map();
  return {
    schedules,
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...values) {
          return {
            async first() {
              if (normalized.startsWith('SELECT data_json FROM menu_months')) return null;
              if (normalized.startsWith('SELECT * FROM menu_schedules WHERE guild_id = ?')) {
                return schedules.get(values[0]) || null;
              }
              throw new Error(`Unhandled first SQL: ${normalized}`);
            },
            async all() {
              if (normalized.startsWith('SELECT * FROM menu_schedules')) {
                const [postTime, postDate] = values;
                return {
                  results: Array.from(schedules.values()).filter((schedule) => (
                    schedule.enabled === 1
                    && schedule.post_time === postTime
                    && schedule.last_post_date !== postDate
                  )),
                };
              }
              throw new Error(`Unhandled all SQL: ${normalized}`);
            },
            async run() {
              if (normalized.startsWith('INSERT INTO menu_schedules')) {
                const [guildId, channelId, postTime, timezone, updatedBy, updatedAt] = values;
                const current = schedules.get(guildId);
                schedules.set(guildId, {
                  guild_id: guildId,
                  channel_id: channelId,
                  post_time: postTime,
                  timezone,
                  enabled: 1,
                  last_post_date: current?.last_post_date || null,
                  last_error: null,
                  updated_by: updatedBy,
                  updated_at: updatedAt,
                });
                return { meta: { changes: 1 } };
              }
              if (normalized.startsWith('UPDATE menu_schedules SET enabled = 0')) {
                const [updatedBy, updatedAt, guildId] = values;
                const current = schedules.get(guildId);
                if (current) schedules.set(guildId, { ...current, enabled: 0, updated_by: updatedBy, updated_at: updatedAt });
                return { meta: { changes: current ? 1 : 0 } };
              }
              if (normalized.startsWith('UPDATE menu_schedules SET last_post_date')) {
                const [postDate, updatedAt, guildId] = values;
                const current = schedules.get(guildId);
                schedules.set(guildId, { ...current, last_post_date: postDate, last_error: null, updated_at: updatedAt });
                return { meta: { changes: 1 } };
              }
              if (normalized.startsWith('UPDATE menu_schedules SET last_error')) {
                const [lastError, updatedAt, guildId] = values;
                const current = schedules.get(guildId);
                schedules.set(guildId, { ...current, last_error: lastError, updated_at: updatedAt });
                return { meta: { changes: 1 } };
              }
              throw new Error(`Unhandled run SQL: ${normalized}`);
            },
          };
        },
      };
    },
  };
}

function seedSchedule(DB, overrides = {}) {
  DB.schedules.set('guild-1', {
    guild_id: 'guild-1',
    channel_id: 'channel-1',
    post_time: '08:00',
    timezone: 'Asia/Tokyo',
    enabled: 1,
    last_post_date: null,
    last_error: null,
    updated_by: 'user-1',
    updated_at: 0,
    ...overrides,
  });
}

test('menu-schedule set/status/off stores server schedule', async () => {
  const DB = createScheduleDb();
  const env = { DB };
  const base = {
    type: 2,
    guild_id: 'guild-1',
    channel_id: 'current-channel',
    user: { id: 'user-1' },
  };

  const setResponse = await handleInteraction({
    ...base,
    data: {
      name: 'menu-schedule',
      options: [{ type: 1, name: 'set', options: [{ name: 'time', value: '08:00' }] }],
    },
  }, env, new Date('2026-06-18T00:00:00Z'));
  assert.match(setResponse.data.content, /08:00/);
  assert.equal(DB.schedules.get('guild-1').channel_id, 'current-channel');

  const statusResponse = await handleInteraction({
    ...base,
    data: { name: 'menu-schedule', options: [{ type: 1, name: 'status' }] },
  }, env, new Date('2026-06-18T00:01:00Z'));
  assert.match(statusResponse.data.content, /ON/);
  assert.match(statusResponse.data.content, /08:00/);

  await handleInteraction({
    ...base,
    data: { name: 'menu-schedule', options: [{ type: 1, name: 'off' }] },
  }, env, new Date('2026-06-18T00:02:00Z'));
  assert.equal(DB.schedules.get('guild-1').enabled, 0);
});

test('menu-schedule set can use selected channel', async () => {
  const DB = createScheduleDb();
  const response = await handleInteraction({
    type: 2,
    guild_id: 'guild-1',
    channel_id: 'current-channel',
    user: { id: 'user-1' },
    data: {
      name: 'menu-schedule',
      options: [{
        type: 1,
        name: 'set',
        options: [
          { name: 'time', value: '09:30' },
          { name: 'channel', value: 'selected-channel' },
        ],
      }],
    },
  }, { DB }, new Date('2026-06-18T00:00:00Z'));
  assert.match(response.data.content, /selected-channel/);
  assert.equal(DB.schedules.get('guild-1').channel_id, 'selected-channel');
});

test('scheduled menu posts once per day when time matches', async () => {
  const DB = createScheduleDb();
  seedSchedule(DB);
  const posts = [];
  const fetcher = async (url, init) => {
    posts.push({ url, body: JSON.parse(init.body) });
    return new Response('{}', { status: 200 });
  };

  const first = await handleScheduledMenus({ DB, DISCORD_TOKEN: 'token' }, new Date('2026-06-18T23:00:00Z'), fetcher);
  const second = await handleScheduledMenus({ DB, DISCORD_TOKEN: 'token' }, new Date('2026-06-18T23:00:30Z'), fetcher);

  assert.deepEqual(first, { checked: 1, posted: 1, failed: 0 });
  assert.deepEqual(second, { checked: 0, posted: 0, failed: 0 });
  assert.equal(posts.length, 1);
  assert.equal(DB.schedules.get('guild-1').last_post_date, '2026-06-19');
});

test('scheduled menu records Discord post errors', async () => {
  const DB = createScheduleDb();
  seedSchedule(DB);
  const result = await handleScheduledMenus(
    { DB, DISCORD_TOKEN: 'token' },
    new Date('2026-06-18T23:00:00Z'),
    async () => new Response('missing permissions', { status: 403 }),
  );
  assert.deepEqual(result, { checked: 1, posted: 0, failed: 1 });
  assert.match(DB.schedules.get('guild-1').last_error, /403/);
});
