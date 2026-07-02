import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { formatMenu, handleInteraction, parseManualData, parseMenuDate, parseOcrText, verifyDiscordRequest } from '../worker/index.mjs';

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

test('Worker版の日付指定とメニュー表示', async () => {
  const now = new Date('2026-06-18T00:00:00Z');
  assert.equal(parseMenuDate('6/19', 'Asia/Tokyo', now), '2026-06-19');
  assert.match(await formatMenu({}, '2026-06-19', '2026-06-19'), /鶏肉の香草焼き定食/);
});

test('Worker版のDiscord応答を生成する', async () => {
  const response = await handleInteraction({ type: 2, data: { name: 'menu', options: [{ name: 'date', value: '6/20' }] } }, { TIMEZONE: 'Asia/Tokyo' }, new Date('2026-06-19T00:00:00Z'));
  assert.equal(response.type, 4);
  assert.match(response.data.content, /お休みです/);
});

test('手入力メニューを候補形式へ変換する', () => {
  assert.deepEqual(parseManualData('6/19 | A定食 | B麺\n6/20 | 休業', '2026-06'), {
    '2026-06-19': { a: 'A定食', b: 'B麺' },
    '2026-06-20': { closed: true },
  });
});

test('日本語OCRテキストを候補形式へ変換する', () => {
  assert.deepEqual(parseOcrText('6月19日 A: 鶏肉の香草焼き定食 B: 塩たんめん\n6月20日 休業', '2026-06'), {
    '2026-06-19': { a: '鶏肉の香草焼き定食', b: '塩たんめん' },
    '2026-06-20': { closed: true },
  });
});

test('改行を含むOCRテキストを候補形式へ変換する', () => {
  assert.deepEqual(parseOcrText('19日(金)\n日替わりA 鶏肉の香草焼き定食\n日替わりB 塩たんめん\n20日(土)\n休業', '2026-06'), {
    '2026-06-19': { a: '鶏肉の香草焼き定食', b: '塩たんめん' },
    '2026-06-20': { closed: true },
  });
});

test('管理コマンドは開発者以外を拒否する', async () => {
  const response = await handleInteraction({
    type: 2,
    user: { id: 'not-developer' },
    data: { name: 'menu-import-preview', options: [{ name: 'import_id', value: 'x' }] },
  }, { DEVELOPER_USER_IDS: '1100526193624743946' });
  assert.match(response.data.content, /開発者のみ/);
  assert.equal(response.data.flags, 64);
});

test('Discord署名を検証する', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicKey = toHex(await crypto.subtle.exportKey('raw', keys.publicKey));
  const timestamp = '1750000000';
  const body = new TextEncoder().encode('{"type":1}');
  const message = new Uint8Array(new TextEncoder().encode(timestamp).length + body.length);
  message.set(new TextEncoder().encode(timestamp));
  message.set(body, new TextEncoder().encode(timestamp).length);
  const signature = toHex(await crypto.subtle.sign({ name: 'Ed25519' }, keys.privateKey, message));
  assert.equal(await verifyDiscordRequest({ publicKey, signature, timestamp, body: body.buffer }), true);
  assert.equal(await verifyDiscordRequest({ publicKey, signature: '00'.repeat(64), timestamp, body: body.buffer }), false);
});

test('Workerの稼働確認URL', async () => {
  const response = await worker.fetch(new Request('https://example.com/'), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'kamome-menu' });
});
