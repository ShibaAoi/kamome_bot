const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

function csv(value) {
  return (value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  rootDir,
  menusDir: path.join(rootDir, 'menus'),
  importsDir: path.join(rootDir, 'temp', 'imports'),
  timezone: process.env.TIMEZONE || 'Asia/Tokyo',
  dailyPostTime: process.env.DAILY_POST_TIME || '09:00',
  developerUserIds: csv(process.env.DEVELOPER_USER_IDS),
  menuChannelIds: csv(process.env.MENU_CHANNEL_IDS),
  importExpireMinutes: positiveNumber(process.env.IMPORT_EXPIRE_MINUTES, 30),
  maxImageBytes: positiveNumber(process.env.MAX_IMAGE_SIZE_MB, 10) * 1024 * 1024,
  defaultLocation: 'K3号館2階 フードコートかもめ',
};

