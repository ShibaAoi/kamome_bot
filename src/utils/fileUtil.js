const fs = require('node:fs/promises');
const path = require('node:path');
const { formatTimestamp } = require('./dateUtil');

async function ensureDir(dir) { await fs.mkdir(dir, { recursive: true }); }
async function readJson(filePath) { return JSON.parse(await fs.readFile(filePath, 'utf8')); }
async function pathExists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function writeJsonAtomic(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function backupFile(filePath, backupDir, month, timezone = 'Asia/Tokyo') {
  if (!(await pathExists(filePath))) return null;
  await ensureDir(backupDir);
  const stamp = formatTimestamp(new Date(), timezone);
  let backupPath = path.join(backupDir, `${month}_${stamp}.json`);
  let suffix = 1;
  while (await pathExists(backupPath)) backupPath = path.join(backupDir, `${month}_${stamp}_${suffix++}.json`);
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

module.exports = { backupFile, ensureDir, pathExists, readJson, writeJsonAtomic };

