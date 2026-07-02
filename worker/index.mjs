import {
  disableMenuSchedule,
  listDueMenuSchedules,
  loadMenuSchedule,
  loadMonth,
  markMenuScheduleError,
  markMenuSchedulePosted,
  saveMenuSchedule,
  saveMonth,
} from './db.mjs';

const INTERACTION_PING = 1;
const INTERACTION_COMMAND = 2;
const RESPONSE_PONG = 1;
const RESPONSE_MESSAGE = 4;
const RESPONSE_DEFERRED_MESSAGE = 5;
const EPHEMERAL = 64;
const DEFAULT_LOCATION = 'K3号館2階 フードコートかもめ';
const MAX_JSON_BYTES = 256 * 1024;
const SCHEDULE_TIMEZONE = 'Asia/Tokyo';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function message(content, ephemeral = false) {
  return { type: RESPONSE_MESSAGE, data: { content, ...(ephemeral ? { flags: EPHEMERAL } : {}) } };
}

function deferredMessage(ephemeral = false) {
  return { type: RESPONSE_DEFERRED_MESSAGE, data: { ...(ephemeral ? { flags: EPHEMERAL } : {}) } };
}

function hexToBytes(value) {
  if (!value || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) throw new Error('16進数の値が不正です。');
  return Uint8Array.from(value.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

export async function verifyDiscordRequest({ publicKey, signature, timestamp, body }) {
  try {
    const key = await crypto.subtle.importKey('raw', hexToBytes(publicKey), { name: 'Ed25519' }, false, ['verify']);
    const timestampBytes = new TextEncoder().encode(timestamp || '');
    const bodyBytes = new Uint8Array(body);
    const signed = new Uint8Array(timestampBytes.length + bodyBytes.length);
    signed.set(timestampBytes);
    signed.set(bodyBytes, timestampBytes.length);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, hexToBytes(signature), signed);
  } catch {
    return false;
  }
}

function zonedToday(timezone = 'Asia/Tokyo', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function zonedDateTime(timezone = SCHEDULE_TIMEZONE, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseMenuDate(input, timezone = 'Asia/Tokyo', now = new Date()) {
  if (!input) return zonedToday(timezone, now);
  const value = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (!isRealDate(value)) throw new Error('日付が正しくありません。');
    return value;
  }
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(value);
  if (!match) throw new Error('日付は 6/18 または YYYY-MM-DD の形式で指定してください。');
  const year = zonedToday(timezone, now).slice(0, 4);
  const result = `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  if (!isRealDate(result)) throw new Error('日付が正しくありません。');
  return result;
}

function assertMonth(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw new Error('対象年月は YYYY-MM の形式で指定してください。');
}

export function parseManualData(text, month) {
  assertMonth(month);
  const menus = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(/\s*\|\s*/);
    const match = /^(?:(\d{4})[-/])?(\d{1,2})[-/](\d{1,2})$/.exec(parts[0]);
    if (!match) throw new Error(`日付を読み取れません: ${parts[0]}`);
    const date = `${match[1] || month.slice(0, 4)}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    if (!isRealDate(date) || date.slice(0, 7) !== month) throw new Error(`対象月外または不正な日付です: ${parts[0]}`);
    if (/^(closed|休み|お休み|休業)$/i.test(parts[1] || '')) menus[date] = { closed: true };
    else {
      if (!parts[1] || !parts[2]) throw new Error(`${parts[0]} は「日付 | A | B」の形式で指定してください。`);
      menus[date] = { a: parts[1], b: parts[2] };
    }
  }
  if (!Object.keys(menus).length) throw new Error('1日分以上のメニューデータを入力してください。');
  return menus;
}

function validateCandidate(candidate) {
  assertMonth(candidate.month);
  if (!candidate.location?.trim()) throw new Error('場所が未設定です。');
  if (!candidate.menus || !Object.keys(candidate.menus).length) throw new Error('メニューデータが空です。');
  for (const [date, entry] of Object.entries(candidate.menus)) {
    if (!isRealDate(date) || date.slice(0, 7) !== candidate.month) throw new Error(`${date} は対象月と一致しません。`);
    if (entry.closed === true) {
      if (Object.keys(entry).some((key) => key !== 'closed')) throw new Error(`${date} の休業日データが不正です。`);
    } else if (!entry.a?.trim() || !entry.b?.trim()) throw new Error(`${date} のA・Bメニューを入力してください。`);
  }
}

function userId(interaction) {
  return interaction.member?.user?.id || interaction.user?.id || '';
}

function isDeveloper(interaction, env) {
  return String(env.DEVELOPER_USER_IDS || '').split(',').map((id) => id.trim()).filter(Boolean).includes(userId(interaction));
}

function optionsOf(interaction) {
  return Object.fromEntries((interaction.data?.options || []).map((option) => [option.name, option.value]));
}

function subcommandOf(interaction) {
  const option = interaction.data?.options?.[0];
  if (!option || option.type !== 1) return { name: null, options: {} };
  return {
    name: option.name,
    options: Object.fromEntries((option.options || []).map((item) => [item.name, item.value])),
  };
}

function validatePostTime(value) {
  const time = String(value || '').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('time は HH:mm 形式で指定してください。例: 08:00');
  return time;
}

export async function formatMenu(env, date, today) {
  const monthData = await loadMonth(env, date.slice(0, 7));
  const menu = monthData?.menus[date];
  if (!menu) return '指定された日のメニュー情報は登録されていません。';
  const [, month, day] = date.split('-');
  const heading = `【${Number(month)}月${Number(day)}日${date === today ? ' 今日' : ''}のメニュー】`;
  if (menu.closed) return `${heading}\n\n本日はお休みです。`;
  return `${heading}\n\n日替わりA：${menu.a}\n日替わりB：${menu.b}\n\n場所：${monthData.location}`;
}

async function handleMenu(interaction, env, now) {
  const options = optionsOf(interaction);
  const timezone = env.TIMEZONE || 'Asia/Tokyo';
  const today = zonedToday(timezone, now);
  const date = parseMenuDate(options.date, timezone, now);
  return message(await formatMenu(env, date, today));
}

async function importJsonMenu(interaction, env, now) {
  const options = optionsOf(interaction);
  assertMonth(options.month);
  const attachment = options.json ? interaction.data.resolved?.attachments?.[options.json] : null;
  if (!attachment) throw new Error('json ファイルを添付してください。');
  if (attachment.size > MAX_JSON_BYTES) throw new Error('JSONファイルは256KB以下にしてください。');
  const response = await fetch(attachment.url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`JSONファイルを取得できませんでした (${response.status})。`);
  const uploaded = JSON.parse(await response.text());
  const candidate = {
    month: uploaded.month || options.month,
    location: String(uploaded.location || options.location || DEFAULT_LOCATION).trim(),
    source: {
      type: 'json_upload',
      importedAt: now.toISOString(),
      uploadedBy: userId(interaction),
      originalFileName: attachment.filename,
    },
    menus: uploaded.menus,
  };
  if (candidate.month !== options.month) throw new Error('コマンドのmonthとJSON内のmonthが一致しません。');
  validateCandidate(candidate);
  const result = await saveMonth(env, candidate, now.getTime());
  const [year, month] = candidate.month.split('-').map(Number);
  return `${year}年${month}月のメニューデータを保存しました。\nすべてのサーバーで反映されます。\n${result.backupCreated ? 'バックアップもD1へ保存しました。' : '新規データとして保存しました。'}`;
}

async function updateOriginalInteraction(interaction, content, fetcher = fetch) {
  const response = await fetcher(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) throw new Error(`Discord応答更新に失敗しました (${response.status}): ${await response.text()}`);
}

async function handleImport(interaction, env, now, ctx) {
  if (ctx?.waitUntil && interaction.application_id && interaction.token) {
    ctx.waitUntil((async () => {
      try {
        await updateOriginalInteraction(interaction, await importJsonMenu(interaction, env, now));
      } catch (error) {
        await updateOriginalInteraction(interaction, error instanceof Error ? error.message : '処理中にエラーが発生しました。').catch(() => {});
      }
    })());
    return deferredMessage(true);
  }
  return message(await importJsonMenu(interaction, env, now), true);
}

async function handleSchedule(interaction, env, now) {
  if (!interaction.guild_id) return message('このコマンドはサーバー内で使用してください。', true);
  if (!env.DB) throw new Error('Cloudflare D1 is not configured.');
  const { name, options } = subcommandOf(interaction);
  const guildId = interaction.guild_id;
  const updatedBy = userId(interaction);
  const updatedAt = now.getTime();

  if (name === 'set') {
    const postTime = validatePostTime(options.time);
    const channelId = String(options.channel || interaction.channel_id || '').trim();
    if (!channelId) throw new Error('投稿先チャンネルを取得できませんでした。channel を指定してください。');
    await saveMenuSchedule(env, {
      guildId,
      channelId,
      postTime,
      timezone: SCHEDULE_TIMEZONE,
      updatedBy,
      updatedAt,
    });
    return message(`毎日 ${postTime} に <#${channelId}> へ当日のメニューを投稿します。`, true);
  }

  if (name === 'status') {
    const schedule = await loadMenuSchedule(env, guildId);
    if (!schedule) return message('このサーバーには定時投稿が設定されていません。', true);
    const state = schedule.enabled ? 'ON' : 'OFF';
    const lastPost = schedule.lastPostDate ? `\nlast_post: ${schedule.lastPostDate}` : '';
    const lastError = schedule.lastError ? `\nlast_error: ${schedule.lastError}` : '';
    return message(`定時投稿: ${state}\n時刻: ${schedule.postTime}\n投稿先: <#${schedule.channelId}>${lastPost}${lastError}`, true);
  }

  if (name === 'off') {
    await disableMenuSchedule(env, guildId, updatedBy, updatedAt);
    return message('このサーバーの定時投稿をOFFにしました。', true);
  }

  return message('未対応のサブコマンドです。', true);
}

async function postDiscordMessage(channelId, content, token, fetcher = fetch) {
  const response = await fetcher(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bot ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) throw new Error(`Discord post failed (${response.status}): ${await response.text()}`);
}

export async function handleScheduledMenus(env, now = new Date(), fetcher = fetch) {
  if (!env.DB || !env.DISCORD_TOKEN) return { checked: 0, posted: 0, failed: 0 };
  const { date, time } = zonedDateTime(SCHEDULE_TIMEZONE, now);
  const schedules = await listDueMenuSchedules(env, time, date);
  let posted = 0;
  let failed = 0;
  for (const schedule of schedules) {
    try {
      const content = await formatMenu(env, date, date);
      await postDiscordMessage(schedule.channelId, content, env.DISCORD_TOKEN, fetcher);
      await markMenuSchedulePosted(env, schedule.guildId, date, now.getTime());
      posted += 1;
    } catch (error) {
      failed += 1;
      await markMenuScheduleError(env, schedule.guildId, error.message || 'scheduled post failed', now.getTime());
    }
  }
  return { checked: schedules.length, posted, failed };
}

export async function handleInteraction(interaction, env, now = new Date(), ctx = null) {
  if (interaction.type === INTERACTION_PING) return { type: RESPONSE_PONG };
  if (interaction.type !== INTERACTION_COMMAND) return message('未対応の操作です。', true);
  try {
    if (interaction.data?.name === 'menu') return await handleMenu(interaction, env, now);
    if (interaction.data?.name === 'menu-schedule') return await handleSchedule(interaction, env, now);
    if (interaction.data?.name !== 'menu-import') return message('未対応のコマンドです。', true);
    if (!isDeveloper(interaction, env)) return message('このコマンドは開発者のみ使用できます。', true);
    if (!env.DB) throw new Error('Cloudflare D1が設定されていません。');
    return await handleImport(interaction, env, now, ctx);
  } catch (error) {
    return message(error instanceof Error ? error.message : '処理中にエラーが発生しました。', true);
  }
}

export default {
  async scheduled(_event, env) {
    await handleScheduledMenus(env);
  },

  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    if (request.method === 'GET') return json({ ok: true, service: 'kamome-menu' });
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    if (!env.DISCORD_PUBLIC_KEY) return new Response('DISCORD_PUBLIC_KEY is not configured.', { status: 500 });
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.arrayBuffer();
    if (!await verifyDiscordRequest({ publicKey: env.DISCORD_PUBLIC_KEY, signature, timestamp, body })) return new Response('Invalid request signature', { status: 401 });
    try {
      return json(await handleInteraction(JSON.parse(new TextDecoder().decode(body)), env, new Date(), ctx));
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }
  },
};
