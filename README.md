# kamome_bot

K3号館2階「フードコートかもめ」の日替わりメニューをDiscordで案内するBotです。メニューは全Discordサーバーで共通管理され、指定チャンネルへの毎日投稿にも対応します。

## Cloudflare Workers版（常時起動不要）

`worker/` には、Discordコマンドが届いた時だけ動くCloudflare Workers版があります。現在対応しているのは `/menu` と日付指定です。PCを起動しておく必要はありません。

1. Cloudflareへログインします。

   ```powershell
   npm.cmd exec wrangler login
   ```

2. Workerを配置します。

   ```powershell
   npm.cmd run worker:deploy
   ```

3. Discord Developer Portalのアプリケーション画面から `PUBLIC KEY` を確認し、Workerへ登録します。

   ```powershell
   npm.cmd exec wrangler secret put DISCORD_PUBLIC_KEY
   ```

4. 配置後に表示される `https://kamome-menu.<subdomain>.workers.dev` を、Discord Developer Portalの `Interactions Endpoint URL` に設定します。Discordによる検証が成功したことを確認してください。

5. Worker版のコマンドだけをグローバル登録します。この操作は既存のグローバルコマンド一覧を `/menu` だけに置き換えます。

   ```powershell
   npm.cmd run worker:commands
   ```

ローカル確認では `.dev.vars.example` を `.dev.vars` に複製し、Discordの公開鍵を設定して `npm.cmd run worker:dev` を実行します。BotトークンはWorkerへ登録しません。

画像インポート、バックアップ、自動投稿は現在PC常駐版だけの機能です。Cloudflare Workersには永続的なローカルディスクがないため、これらの移行にはKVなどの保存先を追加する必要があります。

## 必要なもの

- Node.js 18以上（推奨: 20以上）
- Discord Botアプリケーション

依存パッケージは `discord.js`、`dotenv`、`node-cron` です。

## セットアップ

1. 依存パッケージをインストールします。

   ```powershell
   npm.cmd install
   ```

2. `.env.example` を `.env` に複製し、値を設定します。

   ```powershell
   Copy-Item .env.example .env
   ```

3. Discord Developer PortalでBotをサーバーへ招待します。`bot` と `applications.commands` スコープ、および閲覧・メッセージ送信・ファイル添付権限が必要です。

4. Botを起動します。

   ```powershell
   npm.cmd start
   ```

`GUILD_ID` を設定すると、そのサーバーだけへコマンドを即時登録します。空の場合はグローバル登録となり、Discordへの反映に時間がかかることがあります。

## 環境変数

- `DISCORD_TOKEN`: Botトークン（必須）
- `CLIENT_ID`: DiscordアプリケーションID（必須）
- `GUILD_ID`: 開発中にコマンドを登録するサーバーID（任意）
- `DEVELOPER_USER_IDS`: 管理コマンドを使えるユーザーID。カンマ区切り
- `MENU_CHANNEL_IDS`: 毎日投稿するチャンネルID。カンマ区切り
- `TIMEZONE`: タイムゾーン。既定値は `Asia/Tokyo`
- `DAILY_POST_TIME`: 毎日投稿時刻。`HH:MM` 形式
- `IMPORT_EXPIRE_MINUTES`: 画像インポート候補の有効時間
- `OCR_PROVIDER`: 現在は `mock` のみ
- `MAX_IMAGE_SIZE_MB`: 画像サイズ上限。既定値は10MB

`.env` はGit管理対象外です。BotトークンやAPIキーをソースへ書かないでください。

## コマンド

- `/menu`: 今日のメニューを表示
- `/menu date:6/18`: 指定日のメニューを表示（完全な `YYYY-MM-DD` も可）
- `/menu-import`: 画像から一時的なJSON候補を生成（開発者のみ）
- `/menu-import-preview`: 候補をJSONファイルで確認（開発者のみ）
- `/menu-import-confirm`: 候補を正式保存（開発者のみ）
- `/menu-import-cancel`: 候補を破棄（開発者のみ）

正式保存時、既存データは `menus/backups/` に退避されます。一時画像と候補は確定・破棄・期限切れ時に削除されます。

## OCRについて

初期実装の `OCR_PROVIDER=mock` は画像認識を行わず、空の候補を生成します。処理の動作確認では、環境変数 `MOCK_OCR_TEXT` に次の形式のテキストを設定すると候補を作れます。

```txt
6/18 | サムギョプサル丼 | ジャージャー麺
6/20 | 休業
```

実画像を認識する運用には、利用するOCRサービスの決定、API認証情報、`src/services/ocrService.js` のプロバイダー実装が別途必要です。候補はOCR方式に関係なく、プレビューして明示的に確定するまで `menus/` へ保存されません。

## 検証

```powershell
npm.cmd test
npm.cmd run check
```
