const { SlashCommandBuilder } = require('discord.js');
const { requireDeveloper } = require('../services/permissionService');
const imageImportService = require('../services/imageImportService');

const data = new SlashCommandBuilder()
  .setName('menu-import')
  .setDescription('メニュー画像からJSON候補を生成します（開発者専用）')
  .addStringOption((option) => option.setName('month').setDescription('対象年月（YYYY-MM）').setRequired(true))
  .addAttachmentOption((option) => option.setName('image').setDescription('メニュー画像').setRequired(true))
  .addStringOption((option) => option.setName('location').setDescription('食堂名').setRequired(false));

async function execute(interaction) {
  if (!(await requireDeveloper(interaction))) return;
  await interaction.deferReply({ ephemeral: true });
  const record = await imageImportService.createImport({
    month: interaction.options.getString('month', true),
    location: interaction.options.getString('location'),
    attachment: interaction.options.getAttachment('image', true),
    userId: interaction.user.id,
  });
  const count = Object.keys(record.candidate.menus).length;
  await interaction.editReply(`JSON候補を生成しました（${count}日分）。\nimport_id: \`${record.importId}\`\n\`/menu-import-preview\` で内容を確認してください。`);
}

module.exports = { data, execute };

