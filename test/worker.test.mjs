import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { formatMenu, handleInteraction, parseMenuDate, verifyDiscordRequest } from '../worker/index.mjs';

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

test('Worker版の日付指定とメニュー表示', () => {
  const now = new Date('2026-06-18T00:00:00Z');
  assert.equal(parseMenuDate('6/19', 'Asia/Tokyo', now), '2026-06-19');
  assert.match(formatMenu('2026-06-19', '2026-06-19'), /鶏肉の香草焼き定食/);
});

test('Worker版のDiscord応答を生成する', () => {
  const response = handleInteraction({ type: 2, data: { name: 'menu', options: [{ name: 'date', value: '6/20' }] } }, { TIMEZONE: 'Asia/Tokyo' }, new Date('2026-06-19T00:00:00Z'));
  assert.equal(response.type, 4);
  assert.match(response.data.content, /お休みです/);
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

