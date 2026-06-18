const { SlashCommandBuilder } = require('discord.js');
const { requireDeveloper } = require('../services/permissionService');
const imageImportService = require('../services/imageImportService');
const menuService = require('../services/menuService');
const { assertValidMenuData } = require('../utils/jsonValidator');

const data = new SlashCommandBuilder()
  .setName('menu-import-confirm')
  .setDescription('確認済みのメニュー候補を保存します（開発者専用）')
  .addStringOption((option) => option.setName('import_id').setDescription('インポートID').setRequired(true));

async function execute(interaction) {
  if (!(await requireDeveloper(interaction))) return;
  await interaction.deferReply({ ephemeral: true });
  const importId = interaction.options.getString('import_id', true);
  await imageImportService.withImportLock(importId, async () => {
    const record = await imageImportService.getImport(importId);
    assertValidMenuData(record.candidate);
    const { backupPath } = await menuService.saveMonth(record.candidate);
    await imageImportService.removeImport(importId, record);
    const [year, month] = record.candidate.month.split('-').map(Number);
    await interaction.editReply(`${year}年${month}月のメニューデータを保存しました。\nこの変更はBotが参加しているすべてのサーバーで反映されます。\n${backupPath ? 'バックアップも作成済みです。' : '新規データとして保存しました。'}`);
  });
}

module.exports = { data, execute };

