require('dotenv').config();

const { Client, Events, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { startDailyPost } = require('./scheduler/dailyPost');
const { cleanupExpiredImports } = require('./services/imageImportService');

const commandModules = [
  require('./commands/menu'),
  require('./commands/menuImport'),
  require('./commands/menuImportPreview'),
  require('./commands/menuImportConfirm'),
  require('./commands/menuImportCancel'),
];
const commands = new Map(commandModules.map((command) => [command.data.name, command]));

function validateEnvironment() {
  const missing = ['DISCORD_TOKEN', 'CLIENT_ID'].filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`必須の環境変数が未設定です: ${missing.join(', ')}`);
}

async function registerCommands(client) {
  const payload = commandModules.map((command) => command.data.toJSON());
  if (process.env.GUILD_ID) {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.commands.set(payload);
    console.log(`[commands] ${guild.name} に ${payload.length} 件登録しました。`);
  } else {
    await client.application.commands.set(payload);
    console.log(`[commands] グローバルに ${payload.length} 件登録しました。`);
  }
}

async function sendError(interaction, error) {
  console.error(`[interaction:${interaction.commandName}]`, error);
  const content = error instanceof Error ? error.message : '処理中にエラーが発生しました。';
  if (interaction.deferred) await interaction.editReply({ content, files: [] }).catch(() => {});
  else if (interaction.replied) await interaction.followUp({ content, ephemeral: true }).catch(() => {});
  else await interaction.reply({ content, ephemeral: true }).catch(() => {});
}

async function main() {
  validateEnvironment();
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, async (readyClient) => {
    try {
      await registerCommands(readyClient);
      await cleanupExpiredImports();
      startDailyPost(readyClient);
      const cleanupTimer = setInterval(() => cleanupExpiredImports().catch((error) => console.error('[cleanup]', error)), 60_000);
      cleanupTimer.unref();
      console.log(`[ready] ${readyClient.user.tag} として起動しました。`);
    } catch (error) {
      console.error('[startup]', error);
      await readyClient.destroy();
      process.exitCode = 1;
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = commands.get(interaction.commandName);
    if (!command) return;
    try { await command.execute(interaction); } catch (error) { await sendError(interaction, error); }
  });

  await client.login(process.env.DISCORD_TOKEN);
}

if (require.main === module) main().catch((error) => { console.error('[fatal]', error); process.exitCode = 1; });

module.exports = { main, registerCommands, validateEnvironment };

