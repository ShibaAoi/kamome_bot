import 'dotenv/config';

const { DISCORD_TOKEN, CLIENT_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('DISCORD_TOKEN と CLIENT_ID を .env に設定してください。');
  process.exit(1);
}

const commands = [{
  name: 'menu',
  description: 'フードコートかもめの日替わりメニューを表示します',
  type: 1,
  options: [{
    name: 'date',
    description: '6/18 または YYYY-MM-DD',
    type: 3,
    required: false,
  }],
}];

const response = await fetch(`https://discord.com/api/v10/applications/${CLIENT_ID}/commands`, {
  method: 'PUT',
  headers: { authorization: `Bot ${DISCORD_TOKEN}`, 'content-type': 'application/json' },
  body: JSON.stringify(commands),
});

if (!response.ok) {
  console.error(`Discordコマンド登録に失敗しました (${response.status}): ${await response.text()}`);
  process.exit(1);
}
console.log('サーバーレス版 /menu をグローバル登録しました。');

