const path = require('node:path');
const config = require('../config');
const { assertValidMenuData } = require('../utils/jsonValidator');
const { backupFile, pathExists, readJson, writeJsonAtomic } = require('../utils/fileUtil');

function menuPath(month) { return path.join(config.menusDir, `${month}.json`); }

async function loadMonth(month) {
  const filePath = menuPath(month);
  if (!(await pathExists(filePath))) return null;
  return assertValidMenuData(await readJson(filePath));
}

async function getMenu(date) {
  const data = await loadMonth(date.slice(0, 7));
  if (!data || !data.menus[date]) return null;
  return { date, location: data.location, menu: data.menus[date] };
}

async function saveMonth(data) {
  assertValidMenuData(data);
  const filePath = menuPath(data.month);
  const backupPath = await backupFile(filePath, path.join(config.menusDir, 'backups'), data.month, config.timezone);
  await writeJsonAtomic(filePath, data);
  return { filePath, backupPath };
}

module.exports = { getMenu, loadMonth, menuPath, saveMonth };

