const { AttachmentBuilder, SlashCommandBuilder } = require('discord.js');
const { requireDeveloper } = require('../services/permissionService');
const { getImport } = require('../services/imageImportService');

const data = new SlashCommandBuilder()
  .setName('menu-import-preview')
  .setDescription('生成したメニューJSON候補を確認します（開発者専用）')
  .addStringOption((option) => option.setName('import_id').setDescription('インポートID').setRequired(true));

async function execute(interaction) {
  if (!(await requireDeveloper(interaction))) return;
  const record = await getImport(interaction.options.getString('import_id', true));
  const json = JSON.stringify(record.candidate, null, 2);
  const count = Object.keys(record.candidate.menus).length;
  await interaction.reply({
    content: `候補は ${count}日分です。内容を確認し、問題なければ \`/menu-import-confirm\` を実行してください。`,
    files: [new AttachmentBuilder(Buffer.from(json, 'utf8'), { name: `${record.candidate.month}-preview.json` })],
    ephemeral: true,
  });
}

module.exports = { data, execute };

