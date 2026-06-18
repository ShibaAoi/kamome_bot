import {
  cancelImport,
  claimOcrJob,
  completeOcrJob,
  confirmImport,
  enqueueOcrJob,
  failOcrJob,
  loadImport,
  loadMonth,
  loadOcrJob,
  saveImport,
} from './db.mjs';

const INTERACTION_PING = 1;
const INTERACTION_COMMAND = 2;
const RESPONSE_PONG = 1;
const RESPONSE_MESSAGE = 4;
const EPHEMERAL = 64;
const DEFAULT_LOCATION = 'K3号館2階 フードコートかもめ';
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function message(content, ephemeral = false) {
  return { type: RESPONSE_MESSAGE, data: { content, ...(ephemeral ? { flags: EPHEMERAL } : {}) } };
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

export function parseOcrText(text, month) {
  assertMonth(month);
  const normalized = String(text || '')
    .replace(/[｜]/g, '|')
    .replace(/[：]/g, ':');
  const converted = [];
  for (const rawLine of normalized.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const dateMatch = /(?:^|\s)(?:(\d{4})[\-/年])?(\d{1,2})[\-/月](\d{1,2})(?:日)?/.exec(line);
    if (!dateMatch) continue;
    const dateText = `${dateMatch[1] ? `${dateMatch[1]}/` : ''}${dateMatch[2]}/${dateMatch[3]}`;
    const remainder = line.slice(dateMatch.index + dateMatch[0].length).trim().replace(/^[:|\s]+/, '');
    if (/^(closed|休み|お休み|休業)/i.test(remainder)) {
      converted.push(`${dateText} | 休業`);
      continue;
    }
    const labeled = /(?:日替わり)?A\s*[:：]\s*(.+?)\s+(?:日替わり)?B\s*[:：]\s*(.+)$/i.exec(remainder);
    if (labeled) {
      converted.push(`${dateText} | ${labeled[1].trim()} | ${labeled[2].trim()}`);
      continue;
    }
    const columns = remainder.split(/\s*(?:\||\t| {2,})\s*/).filter(Boolean);
    if (columns.length >= 2) converted.push(`${dateText} | ${columns[0]} | ${columns.slice(1).join(' ')}`);
  }
  if (!converted.length) throw new Error('OCR結果からメニュー行を抽出できませんでした。manual_data を利用してください。');
  return parseManualData(converted.join('\n'), month);
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

function validateAttachment(attachment) {
  if (!attachment) return;
  if (!ALLOWED_IMAGE_TYPES.has(String(attachment.content_type || '').toLowerCase())) throw new Error('jpg、jpeg、png、webp の画像を指定してください。');
  if (!attachment.size || attachment.size > MAX_IMAGE_BYTES) throw new Error('画像サイズは10MB以下にしてください。');
}

function previewText(candidate) {
  const lines = [`【${candidate.month} メニュー候補】`, `場所：${candidate.location}`, ''];
  for (const [date, entry] of Object.entries(candidate.menus).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(entry.closed ? `${date}：休業` : `${date}：A ${entry.a} / B ${entry.b}`);
  }
  const output = lines.join('\n');
  return output.length <= 1900 ? output : `${output.slice(0, 1850)}\n…（以降省略）`;
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

async function handleImport(interaction, env, now) {
  const options = optionsOf(interaction);
  assertMonth(options.month);
  const attachment = options.image ? interaction.data.resolved?.attachments?.[options.image] : null;
  validateAttachment(attachment);
  const createdAt = now.getTime();
  const expiresAt = createdAt + Number(env.IMPORT_EXPIRE_MINUTES || 30) * 60_000;
  if (!options.manual_data && attachment) {
    const id = crypto.randomUUID();
    await enqueueOcrJob(env, {
      id,
      attachmentUrl: attachment.url,
      contentType: attachment.content_type,
      originalFileName: attachment.filename,
      month: options.month,
      location: String(options.location || DEFAULT_LOCATION).trim(),
      createdBy: userId(interaction),
      createdAt,
      expiresAt,
    });
    return message(`画像をローカルOCR待ちに登録しました。\nimport_id: \`${id}\`\nPCのOCRエージェントが処理後、\`/menu-import-preview\` で確認できます。`, true);
  }
  if (!options.manual_data) throw new Error('image または manual_data を指定してください。');
  const candidate = {
    month: options.month,
    location: String(options.location || DEFAULT_LOCATION).trim(),
    source: {
      type: attachment ? 'image_with_manual_text' : 'manual_text',
      importedAt: now.toISOString(), uploadedBy: userId(interaction), originalFileName: attachment?.filename || null,
    },
    menus: parseManualData(options.manual_data, options.month),
  };
  validateCandidate(candidate);
  const id = crypto.randomUUID();
  await saveImport(env, {
    id, candidate, createdBy: userId(interaction), originalFileName: attachment?.filename || null,
    createdAt, expiresAt,
  });
  return message(`JSON候補を生成しました（${Object.keys(candidate.menus).length}日分）。\nimport_id: \`${id}\`\n\`/menu-import-preview\` で確認してください。`, true);
}

async function handlePreview(interaction, env, now) {
  const id = optionsOf(interaction).import_id;
  const record = await loadImport(env, id, now.getTime());
  if (!record) {
    const job = await loadOcrJob(env, id);
    if (job?.status === 'queued') return message('画像はローカルOCRの処理待ちです。PCのOCRエージェントを起動してください。', true);
    if (job?.status === 'processing') return message('ローカルOCRで画像を処理中です。少し待ってから再度確認してください。', true);
    if (job?.status === 'failed') throw new Error(job.error || 'OCR処理に失敗しました。');
    throw new Error('インポート候補が見つかりません。期限切れまたは処理済みです。');
  }
  return message(previewText(record.candidate), true);
}

async function handleConfirm(interaction, env, now) {
  const record = await loadImport(env, optionsOf(interaction).import_id, now.getTime());
  if (!record) throw new Error('インポート候補が見つかりません。期限切れまたは処理済みです。');
  validateCandidate(record.candidate);
  const result = await confirmImport(env, record, now.getTime());
  const [year, month] = record.candidate.month.split('-').map(Number);
  return message(`${year}年${month}月のメニューデータを保存しました。\nすべてのサーバーで反映されます。\n${result.backupCreated ? 'バックアップもD1へ保存しました。' : '新規データとして保存しました。'}`, true);
}

async function handleCancel(interaction, env, now) {
  const id = optionsOf(interaction).import_id;
  const record = await loadImport(env, id, now.getTime());
  const job = record ? null : await loadOcrJob(env, id);
  if (!record && !job) throw new Error('インポート候補が見つかりません。期限切れまたは処理済みです。');
  await cancelImport(env, id);
  return message('インポート候補を破棄しました。', true);
}

function authorizedOcrAgent(request, env) {
  const expected = env.LOCAL_OCR_TOKEN;
  return Boolean(expected) && request.headers.get('authorization') === `Bearer ${expected}`;
}

async function handleOcrApi(request, env, pathname) {
  if (!authorizedOcrAgent(request, env)) return new Response('Unauthorized', { status: 401 });
  if (request.method === 'POST' && pathname === '/ocr/jobs/claim') {
    const job = await claimOcrJob(env);
    return job ? json(job) : new Response(null, { status: 204 });
  }
  const match = /^\/ocr\/jobs\/([0-9a-f-]{36})\/(complete|fail)$/.exec(pathname);
  if (!match || request.method !== 'POST') return new Response('Not Found', { status: 404 });
  const [, id, action] = match;
  const job = await env.DB.prepare('SELECT * FROM ocr_jobs WHERE id = ?').bind(id).first();
  if (!job) return new Response('Job not found', { status: 404 });
  const body = await request.json();
  if (action === 'fail') {
    await failOcrJob(env, id, body.error || 'ローカルOCR処理に失敗しました。');
    return json({ ok: true });
  }
  const rawText = String(body.text || '').slice(0, 100_000);
  try {
    const candidate = {
      month: job.month,
      location: job.location,
      source: {
        type: 'local_ocr', importedAt: new Date().toISOString(), uploadedBy: job.created_by, originalFileName: job.original_file_name,
      },
      menus: parseOcrText(rawText, job.month),
    };
    validateCandidate(candidate);
    await completeOcrJob(env, {
      id: job.id,
      createdBy: job.created_by,
      originalFileName: job.original_file_name,
      expiresAt: job.expires_at,
    }, candidate, rawText);
    return json({ ok: true, menuCount: Object.keys(candidate.menus).length });
  } catch (error) {
    await failOcrJob(env, id, error.message || 'OCR結果の解析に失敗しました。');
    return json({ ok: false, error: error.message }, 422);
  }
}

export async function handleInteraction(interaction, env, now = new Date()) {
  if (interaction.type === INTERACTION_PING) return { type: RESPONSE_PONG };
  if (interaction.type !== INTERACTION_COMMAND) return message('未対応の操作です。', true);
  try {
    if (interaction.data?.name === 'menu') return await handleMenu(interaction, env, now);
    if (!['menu-import', 'menu-import-preview', 'menu-import-confirm', 'menu-import-cancel'].includes(interaction.data?.name)) return message('未対応のコマンドです。', true);
    if (!isDeveloper(interaction, env)) return message('このコマンドは開発者のみ使用できます。', true);
    if (!env.DB) throw new Error('Cloudflare D1が設定されていません。');
    if (interaction.data.name === 'menu-import') return await handleImport(interaction, env, now);
    if (interaction.data.name === 'menu-import-preview') return await handlePreview(interaction, env, now);
    if (interaction.data.name === 'menu-import-confirm') return await handleConfirm(interaction, env, now);
    return await handleCancel(interaction, env, now);
  } catch (error) {
    return message(error instanceof Error ? error.message : '処理中にエラーが発生しました。', true);
  }
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/ocr/')) return handleOcrApi(request, env, pathname);
    if (request.method === 'GET') return json({ ok: true, service: 'kamome-menu' });
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    if (!env.DISCORD_PUBLIC_KEY) return new Response('DISCORD_PUBLIC_KEY is not configured.', { status: 500 });
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.arrayBuffer();
    if (!await verifyDiscordRequest({ publicKey: env.DISCORD_PUBLIC_KEY, signature, timestamp, body })) return new Response('Invalid request signature', { status: 401 });
    try {
      return json(await handleInteraction(JSON.parse(new TextDecoder().decode(body)), env));
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }
  },
};
