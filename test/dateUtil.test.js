const test = require('node:test');
const assert = require('node:assert/strict');
const { formatJapaneseDate, getToday, parseMenuDate } = require('../src/utils/dateUtil');

test('日本時間の日付を取得する', () => {
  assert.equal(getToday('Asia/Tokyo', new Date('2026-06-17T15:30:00Z')), '2026-06-18');
});

test('短い日付を現在年で解釈する', () => {
  assert.equal(parseMenuDate('6/18', 'Asia/Tokyo', new Date('2026-01-01T00:00:00Z')), '2026-06-18');
  assert.equal(formatJapaneseDate('2026-06-18'), '6月18日');
});

test('実在しない日付を拒否する', () => {
  assert.throws(() => parseMenuDate('2/30', 'Asia/Tokyo', new Date('2026-01-01T00:00:00Z')), /正しくありません/);
});

