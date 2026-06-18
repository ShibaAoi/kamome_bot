import { menuMonths } from './menuData.mjs';

const INTERACTION_PING = 1;
const INTERACTION_COMMAND = 2;
const RESPONSE_PONG = 1;
const RESPONSE_MESSAGE = 4;
const EPHEMERAL = 64;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
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
    const message = new Uint8Array(timestampBytes.length + bodyBytes.length);
    message.set(timestampBytes);
    message.set(bodyBytes, timestampBytes.length);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, hexToBytes(signature), message);
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

export function formatMenu(date, today) {
  const monthData = menuMonths[date.slice(0, 7)];
  const menu = monthData?.menus[date];
  if (!menu) return '指定された日のメニュー情報は登録されていません。';
  const [, month, day] = date.split('-');
  const heading = `【${Number(month)}月${Number(day)}日${date === today ? ' 今日' : ''}のメニュー】`;
  if (menu.closed) return `${heading}\n\n本日はお休みです。`;
  return `${heading}\n\n日替わりA：${menu.a}\n日替わりB：${menu.b}\n\n場所：${monthData.location}`;
}

export function handleInteraction(interaction, env, now = new Date()) {
  if (interaction.type === INTERACTION_PING) return { type: RESPONSE_PONG };
  if (interaction.type !== INTERACTION_COMMAND || interaction.data?.name !== 'menu') {
    return { type: RESPONSE_MESSAGE, data: { content: '未対応のコマンドです。', flags: EPHEMERAL } };
  }
  try {
    const input = interaction.data.options?.find((option) => option.name === 'date')?.value;
    const timezone = env.TIMEZONE || 'Asia/Tokyo';
    const today = zonedToday(timezone, now);
    const date = parseMenuDate(input, timezone, now);
    return { type: RESPONSE_MESSAGE, data: { content: formatMenu(date, today) } };
  } catch (error) {
    return { type: RESPONSE_MESSAGE, data: { content: error.message, flags: EPHEMERAL } };
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'GET') return json({ ok: true, service: 'kamome-menu' });
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    if (!env.DISCORD_PUBLIC_KEY) return new Response('DISCORD_PUBLIC_KEY is not configured.', { status: 500 });
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.arrayBuffer();
    const valid = await verifyDiscordRequest({ publicKey: env.DISCORD_PUBLIC_KEY, signature, timestamp, body });
    if (!valid) return new Response('Invalid request signature', { status: 401 });
    let interaction;
    try { interaction = JSON.parse(new TextDecoder().decode(body)); }
    catch { return new Response('Invalid JSON', { status: 400 }); }
    return json(handleInteraction(interaction, env));
  },
};

