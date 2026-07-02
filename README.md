# kamome_bot

K3号館2階「フードコートかもめ」の日替わりメニューをDiscordで案内するBotです。

通常のコマンド処理はCloudflare Workersで必要な時だけ動作します。メニュー更新はCodexで生成したJSONファイルをDiscordから直接アップロードします。

## 構成

- `worker/`: Discord Interactionを受けるCloudflare Worker
- `migrations/`: メニュー、バックアップ、定時投稿用D1スキーマ
- `menus/`: Workerへ組み込む初期メニュー
- `scripts/`: Discordコマンド登録処理
- `test/`: Workerと署名検証のテスト

公開中のWorker:

```text
https://kamome-menu.shiba-6d3.workers.dev
```

## Discordコマンド

- `/menu`: 今日のメニューを表示
- `/menu date:6/19`: 指定日のメニューを表示
- `/menu-import`: JSONファイルからメニューを直接保存（開発者のみ）
- `/menu-schedule`: 毎日の自動投稿を設定・確認・停止

Codexで生成したJSONファイルを添付して保存します。

```text
/menu-import month:2026-07 json:2026-07.menu-preview.json
```

JSONの基本形式:

```json
{
  "month": "2026-07",
  "location": "K3号館2階 フードコートかもめ",
  "menus": {
    "2026-07-01": { "a": "油淋鶏定食", "b": "バンバンジー麺" },
    "2026-07-04": { "closed": true }
  }
}
```

保存時に既存データはD1へバックアップされます。プレビュー用コマンドはありません。アップロード前にCodex上でJSONを確認してください。

## 定時投稿

`/menu-schedule` でサーバーごとに毎日の自動投稿を設定できます。

```text
/menu-schedule set time:08:00
/menu-schedule set time:08:00 channel:#menu
/menu-schedule status
/menu-schedule off
```

`set` で `channel` を省略した場合は、コマンドを実行したチャンネルへ投稿します。投稿内容は当日の `/menu` と同じです。

定時投稿にはCloudflare Worker側の秘密値 `DISCORD_TOKEN` が必要です。Discord Botの招待権限には `View Channel` と `Send Messages` を含めてください。

## Cloudflare

必要な設定:

- Worker変数: `TIMEZONE`、`DEVELOPER_USER_IDS`、`IMPORT_EXPIRE_MINUTES`
- Worker秘密値: `DISCORD_PUBLIC_KEY`、`DISCORD_TOKEN`
- D1 binding: `DB`

D1マイグレーション:

```powershell
npm.cmd exec -- wrangler d1 migrations apply kamome-menu-db --remote
```

Workerの検証と配置:

```powershell
npm.cmd run worker:check
npm.cmd run worker:deploy
```

Discordコマンドの登録:

```powershell
npm.cmd run worker:commands
```

## セキュリティ

以下はGit管理対象外です。

- `.env`
- `.dev.vars`
- CloudflareとGitHubのローカル認証情報

Discord Botトークン、公開鍵をGitHubへ登録しないでください。管理コマンドはWorker側でもDiscordユーザーIDを確認します。

## テスト

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run worker:check
```
