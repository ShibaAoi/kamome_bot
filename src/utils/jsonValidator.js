const { isRealDate, MONTH_PATTERN } = require('./dateUtil');

function validateMenuData(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['JSONのルートはオブジェクトである必要があります。'] };
  }
  if (!MONTH_PATTERN.test(data.month || '')) errors.push('month は YYYY-MM 形式で指定してください。');
  if (typeof data.location !== 'string' || !data.location.trim()) errors.push('location は空でない文字列にしてください。');
  if (!data.menus || typeof data.menus !== 'object' || Array.isArray(data.menus)) {
    errors.push('menus はオブジェクトにしてください。');
    return { valid: false, errors };
  }
  for (const [date, menu] of Object.entries(data.menus)) {
    if (!isRealDate(date)) {
      errors.push(`${date}: 日付は実在する YYYY-MM-DD 形式にしてください。`);
      continue;
    }
    if (data.month && !date.startsWith(`${data.month}-`)) errors.push(`${date}: 対象月 ${data.month} と一致しません。`);
    if (!menu || typeof menu !== 'object' || Array.isArray(menu)) {
      errors.push(`${date}: メニューはオブジェクトにしてください。`);
      continue;
    }
    const keys = Object.keys(menu);
    if (menu.closed === true) {
      if ('a' in menu || 'b' in menu || keys.some((key) => key !== 'closed')) errors.push(`${date}: 休業日には closed: true だけを指定してください。`);
      continue;
    }
    if (typeof menu.a !== 'string' || !menu.a.trim() || typeof menu.b !== 'string' || !menu.b.trim()) errors.push(`${date}: a と b は空でない文字列にしてください。`);
    if (keys.some((key) => !['a', 'b'].includes(key))) errors.push(`${date}: 未対応の項目が含まれています。`);
  }
  return { valid: errors.length === 0, errors };
}

function assertValidMenuData(data) {
  const result = validateMenuData(data);
  if (!result.valid) throw new Error(`メニューデータが不正です。\n${result.errors.join('\n')}`);
  return data;
}

module.exports = { assertValidMenuData, validateMenuData };

