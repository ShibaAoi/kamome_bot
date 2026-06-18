const { SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const menuService = require('../services/menuService');
const { formatJapaneseDate, getToday, parseMenuDate } = require('../utils/dateUtil');

const data = new SlashCommandBuilder()
  .setName('menu')
  .setDescription('フードコートかもめの日替わりメニューを表示します')
  .addStringOption((option) => option.setName('date').setDescription('6/18 または YYYY-MM-DD').setRequired(false));

function formatMenuMessage(result, isToday = false) {
  if (!result) return '指定された日のメニュー情報は登録されていません。';
  const heading = `【${formatJapaneseDate(result.date)}${isToday ? ' 今日' : ''}のメニュー】`;
  if (result.menu.closed) return `${heading}\n\n本日はお休みです。`;
  return `${heading}\n\n日替わりA：${result.menu.a}\n日替わりB：${result.menu.b}\n\n場所：${result.location}`;
}

async function execute(interaction) {
  const input = interaction.options.getString('date');
  const date = parseMenuDate(input, config.timezone);
  const result = await menuService.getMenu(date);
  await interaction.reply(formatMenuMessage(result, date === getToday(config.timezone)));
}

module.exports = { data, execute, formatMenuMessage };

