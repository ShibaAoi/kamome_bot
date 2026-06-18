const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const config = require('../config');
const ocrService = require('./ocrService');
const { assertValidMenuData } = require('../utils/jsonValidator');
const { ensureDir, pathExists, readJson, writeJsonAtomic } = require('../utils/fileUtil');
const { parseMonth } = require('../utils/dateUtil');

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const locks = new Set();

function recordPath(importId) {
  if (!/^[0-9a-f-]{36}$/i.test(importId || '')) throw new Error('import_id が正しくありません。');
  return path.join(config.importsDir, `${importId}.json`);
}

function parseOcrText(text, month) {
  const menus = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s*[|\t]\s*/);
    if (parts.length < 2) continue;
    const dateMatch = /^(?:(\d{4})[-/])?(\d{1,2})[-/](\d{1,2})$/.exec(parts[0]);
    if (!dateMatch) continue;
    const date = `${dateMatch[1] || month.slice(0, 4)}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
    if (date.slice(0, 7) !== month) continue;
    if (/^(closed|休み|お休み|休業)$/i.test(parts[1])) menus[date] = { closed: true };
    else if (parts.length >= 3 && parts[1] && parts[2]) menus[date] = { a: parts[1], b: parts[2] };
  }
  return menus;
}

async function downloadAttachment(attachment, destination) {
  const response = await fetch(attachment.url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`画像を取得できませんでした (${response.status})。`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > config.maxImageBytes) throw new Error('画像ファイルのサイズが上限を超えています。');
  await fs.writeFile(destination, bytes, { flag: 'wx' });
}

function validateAttachment(attachment) {
  const extension = path.extname(attachment.name || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_CONTENT_TYPES.has((attachment.contentType || '').toLowerCase())) {
    throw new Error('jpg、jpeg、png、webp の画像を指定してください。');
  }
  if (!Number.isFinite(attachment.size) || attachment.size <= 0 || attachment.size > config.maxImageBytes) {
    throw new Error(`画像サイズは ${Math.floor(config.maxImageBytes / 1024 / 1024)}MB 以下にしてください。`);
  }
  return extension;
}

async function createImport({ month, location, attachment, userId }) {
  parseMonth(month);
  const extension = validateAttachment(attachment);
  await ensureDir(config.importsDir);
  const importId = randomUUID();
  const imagePath = path.join(config.importsDir, `${importId}${extension}`);
  try {
    await downloadAttachment(attachment, imagePath);
    const ocrText = await ocrService.recognizeImage(imagePath);
    const candidate = {
      month,
      location: (location || config.defaultLocation).trim(),
      source: {
        type: 'image', importedAt: new Date().toISOString(), uploadedBy: String(userId), originalFileName: attachment.name,
      },
      menus: parseOcrText(ocrText, month),
    };
    assertValidMenuData(candidate);
    const createdAt = Date.now();
    const record = {
      importId, createdAt, expiresAt: createdAt + config.importExpireMinutes * 60_000,
      imagePath, candidate,
    };
    await writeJsonAtomic(recordPath(importId), record);
    return record;
  } catch (error) {
    await fs.rm(imagePath, { force: true }).catch(() => {});
    throw error;
  }
}

async function getImport(importId) {
  const filePath = recordPath(importId);
  if (!(await pathExists(filePath))) throw new Error('インポート候補が見つかりません。期限切れまたは破棄済みです。');
  const record = await readJson(filePath);
  if (Date.now() >= record.expiresAt) {
    await removeImport(importId, record);
    throw new Error('インポート候補の有効期限が切れています。');
  }
  return record;
}

async function removeImport(importId, knownRecord = null) {
  const filePath = recordPath(importId);
  let record = knownRecord;
  if (!record && await pathExists(filePath)) record = await readJson(filePath).catch(() => null);
  await fs.rm(filePath, { force: true });
  if (record?.imagePath) await fs.rm(record.imagePath, { force: true });
}

async function withImportLock(importId, operation) {
  if (locks.has(importId)) throw new Error('このインポート候補は現在処理中です。');
  locks.add(importId);
  try { return await operation(); } finally { locks.delete(importId); }
}

async function cleanupExpiredImports() {
  await ensureDir(config.importsDir);
  const files = await fs.readdir(config.importsDir);
  await Promise.all(files.filter((name) => name.endsWith('.json')).map(async (name) => {
    const filePath = path.join(config.importsDir, name);
    const record = await readJson(filePath).catch(() => null);
    if (!record || Date.now() >= record.expiresAt) await removeImport(name.slice(0, -5), record).catch(() => fs.rm(filePath, { force: true }));
  }));
}

module.exports = { cleanupExpiredImports, createImport, getImport, parseOcrText, removeImport, validateAttachment, withImportLock };

