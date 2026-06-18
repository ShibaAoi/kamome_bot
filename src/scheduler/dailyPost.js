const cron = require('node-cron');
const config = require('../config');
const menuService = require('../services/menuService');
const { formatMenuMessage } = require('../commands/menu');
const { getToday } = require('../utils/dateUtil');

function toCronExpression(time) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error('DAILY_POST_TIME は HH:MM 形式で指定してください。');
  return `${Number(match[2])} ${Number(match[1])} * * *`;
}

async function postDailyMenu(client) {
  const date = getToday(config.timezone);
  const content = formatMenuMessage(await menuService.getMenu(date), true);
  const results = await Promise.allSettled(config.menuChannelIds.map(async (channelId) => {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') throw new Error(`投稿できないチャンネルです: ${channelId}`);
    await channel.send(content);
  }));
  results.forEach((result, index) => {
    if (result.status === 'rejected') console.error(`[daily-post] ${config.menuChannelIds[index]}:`, result.reason);
  });
}

function startDailyPost(client) {
  const task = cron.schedule(toCronExpression(config.dailyPostTime), () => {
    postDailyMenu(client).catch((error) => console.error('[daily-post]', error));
  }, { timezone: config.timezone });
  return task;
}

module.exports = { postDailyMenu, startDailyPost, toCronExpression };

