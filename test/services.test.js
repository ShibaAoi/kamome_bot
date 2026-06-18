const test = require('node:test');
const assert = require('node:assert/strict');
const menuService = require('../src/services/menuService');
const { parseOcrText } = require('../src/services/imageImportService');
const { formatMenuMessage } = require('../src/commands/menu');
const { toCronExpression } = require('../src/scheduler/dailyPost');

test('初期メニューを全体共通データから読む', async () => {
  const result = await menuService.getMenu('2026-06-18');
  assert.equal(result.menu.a, 'サムギョプサル丼');
  assert.match(formatMenuMessage(result, true), /今日のメニュー/);
});

test('休業日を整形する', async () => {
  const result = await menuService.getMenu('2026-06-20');
  assert.match(formatMenuMessage(result, false), /お休みです/);
});

test('mock OCRテキストを候補へ変換する', () => {
  const menus = parseOcrText('6/18 | A定食 | B麺\n6/20 | 休業', '2026-06');
  assert.deepEqual(menus['2026-06-18'], { a: 'A定食', b: 'B麺' });
  assert.deepEqual(menus['2026-06-20'], { closed: true });
});

test('投稿時刻をcron形式へ変換する', () => {
  assert.equal(toCronExpression('09:00'), '0 9 * * *');
  assert.throws(() => toCronExpression('25:00'), /HH:MM/);
});

