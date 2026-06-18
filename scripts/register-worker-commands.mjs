import 'dotenv/config';

const { DISCORD_TOKEN, CLIENT_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('DISCORD_TOKEN と CLIENT_ID を .env に設定してください。');
  process.exit(1);
}

const commands = [
  {
    name: 'menu',
    description: 'フードコートかもめの日替わりメニューを表示します',
    type: 1,
    options: [{ name: 'date', description: '6/18 または YYYY-MM-DD', type: 3, required: false }],
  },
  {
    name: 'menu-import',
    description: 'メニュー候補を生成します（開発者専用）',
    type: 1,
    options: [
      { name: 'month', description: '対象年月（YYYY-MM）', type: 3, required: true },
      { name: 'image', description: 'メニュー画像（OCR設定後に利用可能）', type: 11, required: false },
      { name: 'manual_data', description: '例: 6/19 | Aメニュー | Bメニュー（改行で複数日）', type: 3, required: false },
      { name: 'location', description: '食堂名', type: 3, required: false },
    ],
  },
  {
    name: 'menu-import-preview',
    description: '生成したメニュー候補を確認します（開発者専用）',
    type: 1,
    options: [{ name: 'import_id', description: 'インポートID', type: 3, required: true }],
  },
  {
    name: 'menu-import-confirm',
    description: '確認済みのメニュー候補を保存します（開発者専用）',
    type: 1,
    options: [{ name: 'import_id', description: 'インポートID', type: 3, required: true }],
  },
  {
    name: 'menu-import-cancel',
    description: '生成したメニュー候補を破棄します（開発者専用）',
    type: 1,
    options: [{ name: 'import_id', description: 'インポートID', type: 3, required: true }],
  },
];

const response = await fetch(`https://discord.com/api/v10/applications/${CLIENT_ID}/commands`, {
  method: 'PUT',
  headers: { authorization: `Bot ${DISCORD_TOKEN}`, 'content-type': 'application/json' },
  body: JSON.stringify(commands),
});

if (!response.ok) {
  console.error(`Discordコマンド登録に失敗しました (${response.status}): ${await response.text()}`);
  process.exit(1);
}
console.log(`サーバーレス版コマンドを${commands.length}件グローバル登録しました。`);
