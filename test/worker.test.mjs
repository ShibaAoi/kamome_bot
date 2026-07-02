import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { formatMenu, handleInteraction, parseManualData, parseMenuDate, verifyDiscordRequest } from '../worker/index.mjs';

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createMenuDb() {
  const months = new Map();
  const backups = [];
  return {
    months,
    backups,
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...values) {
          return {
            async first() {
              if (normalized.startsWith('SELECT data_json FROM menu_months')) {
                const month = months.get(values[0]);
                return month ? { data_json: JSON.stringify(month) } : null;
              }
              throw new Error(`Unhandled first SQL: ${normalized}`);
            },
            async run() {
              if (normalized.startsWith('INSERT INTO menu_backups')) {
                backups.push({ month: values[0], data: JSON.parse(values[1]), createdAt: values[2] });
                return { meta: { changes: 1 } };
              }
              if (normalized.startsWith('INSERT INTO menu_months')) {
                months.set(values[0], JSON.parse(values[1]));
                return { meta: { changes: 1 } };
              }
              throw new Error(`Unhandled run SQL: ${normalized}`);
            },
          };
        },
      };
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };
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

test('JSONファイルからメニューを直接保存する', async () => {
  const DB = createMenuDb();
  const originalFetch = globalThis.fetch;
  const updates = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/webhooks/')) {
      updates.push(JSON.parse(init.body));
      return new Response('{}', { status: 200 });
    }
    return new Response(JSON.stringify({
      month: '2026-07',
      location: 'K3号館2階 フードコートかもめ',
      menus: {
        '2026-07-01': { a: 'A定食', b: 'B麺' },
        '2026-07-02': { closed: true },
      },
    }), { status: 200 });
  };
  try {
    const waits = [];
    const response = await handleInteraction({
      type: 2,
      application_id: 'app-1',
      token: 'interaction-token',
      user: { id: '1100526193624743946' },
      data: {
        name: 'menu-import',
        options: [
          { name: 'month', value: '2026-07' },
          { name: 'json', value: 'attachment-1' },
        ],
        resolved: {
          attachments: {
            'attachment-1': {
              filename: '2026-07.menu-preview.json',
              size: 1024,
              url: 'https://cdn.example.test/menu.json',
            },
          },
        },
      },
    }, { DB, DEVELOPER_USER_IDS: '1100526193624743946' }, new Date('2026-07-03T00:00:00Z'), {
      waitUntil(promise) { waits.push(promise); },
    });
    assert.equal(response.type, 5);
    assert.equal(response.data.flags, 64);
    await Promise.all(waits);
    assert.match(updates[0].content, /保存しました/);
    assert.deepEqual(DB.months.get('2026-07').menus['2026-07-01'], { a: 'A定食', b: 'B麺' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('管理コマンドは開発者以外を拒否する', async () => {
  const response = await handleInteraction({
    type: 2,
    user: { id: 'not-developer' },
    data: { name: 'menu-import', options: [{ name: 'month', value: '2026-07' }] },
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
