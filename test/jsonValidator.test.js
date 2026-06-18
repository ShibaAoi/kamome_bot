const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMenuData } = require('../src/utils/jsonValidator');

function base(menu) {
  return { month: '2026-06', location: 'テスト食堂', menus: { '2026-06-18': menu } };
}

test('通常営業日と休業日を受け入れる', () => {
  assert.equal(validateMenuData(base({ a: 'A定食', b: 'B麺' })).valid, true);
  assert.equal(validateMenuData(base({ closed: true })).valid, true);
});

test('休業日とメニューの混在を拒否する', () => {
  assert.equal(validateMenuData(base({ closed: true, a: 'A定食', b: 'B麺' })).valid, false);
});

test('対象月外と実在しない日付を拒否する', () => {
  const wrongMonth = { month: '2026-06', location: '食堂', menus: { '2026-07-01': { closed: true } } };
  const impossible = { month: '2026-06', location: '食堂', menus: { '2026-06-31': { closed: true } } };
  assert.equal(validateMenuData(wrongMonth).valid, false);
  assert.equal(validateMenuData(impossible).valid, false);
});

