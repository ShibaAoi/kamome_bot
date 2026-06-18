const { SlashCommandBuilder } = require('discord.js');
const { requireDeveloper } = require('../services/permissionService');
const imageImportService = require('../services/imageImportService');

const data = new SlashCommandBuilder()
  .setName('menu-import-cancel')
  .setDescription('生成したメニュー候補を破棄します（開発者専用）')
  .addStringOption((option) => option.setName('import_id').setDescription('インポートID').setRequired(true));

async function execute(interaction) {
  if (!(await requireDeveloper(interaction))) return;
  const importId = interaction.options.getString('import_id', true);
  await imageImportService.withImportLock(importId, async () => {
    const record = await imageImportService.getImport(importId);
    await imageImportService.removeImport(importId, record);
  });
  await interaction.reply({ content: 'インポート候補を破棄しました。', ephemeral: true });
}

module.exports = { data, execute };

