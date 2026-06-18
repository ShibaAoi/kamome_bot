const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function getZonedParts(date = new Date(), timezone = 'Asia/Tokyo') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { year: values.year, month: values.month, day: values.day };
}

function getToday(timezone = 'Asia/Tokyo', date = new Date()) {
  const { year, month, day } = getZonedParts(date, timezone);
  return `${year}-${month}-${day}`;
}

function isRealDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function parseMenuDate(input, timezone = 'Asia/Tokyo', now = new Date()) {
  if (!input) return getToday(timezone, now);
  const value = input.trim();
  if (DATE_PATTERN.test(value)) {
    if (!isRealDate(value)) throw new Error('日付が正しくありません。');
    return value;
  }
  const shortMatch = /^(\d{1,2})\/(\d{1,2})$/.exec(value);
  if (!shortMatch) throw new Error('日付は 6/18 または YYYY-MM-DD の形式で指定してください。');
  const { year } = getZonedParts(now, timezone);
  const result = `${year}-${shortMatch[1].padStart(2, '0')}-${shortMatch[2].padStart(2, '0')}`;
  if (!isRealDate(result)) throw new Error('日付が正しくありません。');
  return result;
}

function formatJapaneseDate(value) {
  if (!isRealDate(value)) throw new Error('表示できない日付です。');
  const [, month, day] = value.split('-');
  return `${Number(month)}月${Number(day)}日`;
}

function formatTimestamp(date = new Date(), timezone = 'Asia/Tokyo') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}${values.month}${values.day}_${values.hour}${values.minute}${values.second}`;
}

function parseMonth(value) {
  if (!MONTH_PATTERN.test(value || '')) throw new Error('対象年月は YYYY-MM の形式で指定してください。');
  return value;
}

module.exports = { DATE_PATTERN, MONTH_PATTERN, formatJapaneseDate, formatTimestamp, getToday, isRealDate, parseMenuDate, parseMonth };

