# kamome_bot

K3号館2階「フードコートかもめ」の日替わりメニューをDiscordで案内するBotです。

通常のコマンド処理はCloudflare Workersで必要な時だけ動作します。画像OCRだけは利用者のWindows PCで実行し、認識候補をCloudflare D1へ返します。

## 構成

- `worker/`: Discord Interactionを受けるCloudflare Worker
- `migrations/`: メニュー、候補、バックアップ、OCRジョブ用D1スキーマ
- `local-ocr/`: `tesseract.js` による日本語OCRエージェント
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
- `/menu-import`: 画像または手入力から一時候補を作成（開発者のみ）
- `/menu-import-preview`: 候補またはOCR状態を確認（開発者のみ）
- `/menu-import-confirm`: 候補を正式保存し、既存データをD1へバックアップ（開発者のみ）
- `/menu-import-cancel`: 候補またはOCRジョブを破棄（開発者のみ）
- `/menu-schedule`: 毎日の自動投稿を設定・確認・停止

手入力では `manual_data` を次の形式で指定します。複数日は改行します。

```text
6/19 | 鶏肉の香草焼き定食 | 塩たんめん
6/20 | 休業
```

画像を指定した場合はD1へOCR待ちジョブが作られます。PCのOCRエージェントが処理した後、必ずプレビューしてから確定してください。

## ローカルOCR

初回セットアップ:

1. `.env.example` を `.env` に複製します。
2. `WORKER_URL` と `LOCAL_OCR_TOKEN` を設定します。
3. 依存パッケージを導入します。

```powershell
npm.cmd install
```

OCRエージェントを手動起動:

```powershell
npm.cmd run ocr:start
```

または [install-ocr-autostart.cmd](install-ocr-autostart.cmd) を実行すると、Windowsログイン時に非表示で起動します。停止は `stop-ocr-agent.cmd`、自動起動解除は `remove-ocr-autostart.cmd` です。

日本語認識データは初回OCR時に `temp/tesseract-cache/` へ取得されます。OCR処理にWorkers AIや有料OCR APIは使用しません。PCがOFFの場合、画像ジョブは処理待ちとなります。

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
- Worker秘密値: `DISCORD_PUBLIC_KEY`、`LOCAL_OCR_TOKEN`、`DISCORD_TOKEN`
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
- OCRキャッシュ、PID、ログ

Discord Botトークン、公開鍵、`LOCAL_OCR_TOKEN` をGitHubへ登録しないでください。管理コマンドはWorker側でもDiscordユーザーIDを確認します。

## テスト

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run worker:check
```
