const config = require('../config');

function isDeveloper(userId) {
  return config.developerUserIds.includes(String(userId));
}

async function requireDeveloper(interaction) {
  if (isDeveloper(interaction.user.id)) return true;
  await interaction.reply({ content: 'このコマンドは開発者のみ使用できます。', ephemeral: true });
  return false;
}

module.exports = { isDeveloper, requireDeveloper };

