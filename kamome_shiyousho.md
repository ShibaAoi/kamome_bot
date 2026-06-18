# Codex作業指示書：食堂日替わりメニュー Discord Bot

## 0. このファイルの目的

このプロジェクトでは、K3号館2階「フードコートかもめ」の日替わりメニューをDiscordで確認できるBotを作成する。

Codexはこの仕様に従って、Node.js製のDiscord Botを実装すること。

重要な方針：

- メニュー情報はBot全体で共通管理する
- Discordサーバーごとにメニューを分けない
- 開発者として登録されたDiscordユーザーであれば、Botが参加しているどのサーバーからでもメニュー更新を実行できる
- 開発者以外はメニュー更新系コマンドを実行できない
- 画像アップロードによる自動JSON化は、必ず「プレビュー → 確認 → 保存」の流れにする
- OCRや画像認識の結果を即保存してはいけない

---

## 0.1 作業フォルダ

Codexは、以下のローカルフォルダをプロジェクトルートとして使用すること。

```txt
C:\kamome_bot
```

新しくプロジェクトを作る場合は、このフォルダ内で作業する。

Windows PowerShellでの作業開始例：

```powershell
mkdir C:\kamome_bot
cd C:\kamome_bot
npm init -y
```

すでに `C:\kamome_bot` が存在する場合は、既存ファイルを確認してから作業する。
別フォルダに `cafeteria-menu-bot` などを新規作成しないこと。

---

## 1. 使用技術

### 必須

- Node.js
- discord.js
- dotenv
- node-cron

### 任意

画像インポート機能で以下のいずれかを利用できる構造にする。

- OCR API
- Vision API
- TesseractなどのローカルOCR

OCR部分は差し替え可能にするため、`ocrService.js` に分離すること。

---

## 2. Botの基本機能

### 2.1 今日のメニュー表示

スラッシュコマンド：

```txt
/menu
```

今日の日付を日本時間で取得し、該当日のメニューを表示する。

出力例：

```txt
【6月18日 今日のメニュー】

日替わりA：サムギョプサル丼
日替わりB：ジャージャー麺

場所：K3号館2階 フードコートかもめ
```

### 2.2 日付指定メニュー表示

スラッシュコマンド：

```txt
/menu date:6/18
```

指定日のメニューを表示する。

出力例：

```txt
【6月18日のメニュー】

日替わりA：サムギョプサル丼
日替わりB：ジャージャー麺
```

### 2.3 お休み日の表示

該当日が休業日の場合は以下のように表示する。

```txt
【6月20日 今日のメニュー】

本日はお休みです。
```

### 2.4 データがない場合

該当日のメニューデータが存在しない場合：

```txt
指定された日のメニュー情報は登録されていません。
```

---

## 3. メニュー情報の管理方式

### 3.1 グローバル管理

メニュー情報はBot全体で共通管理する。

あるサーバーで開発者がメニューを更新した場合、Botが参加しているすべてのサーバーで同じ更新内容が反映される。

使用する保存先：

```txt
menus/YYYY-MM.json
```

例：

```txt
menus/2026-06.json
```

以下のようなサーバー別保存は禁止する。

```txt
menus/guilds/GUILD_ID/YYYY-MM.json
```

### 3.2 JSON形式

```json
{
  "month": "2026-06",
  "location": "K3号館2階 フードコートかもめ",
  "source": {
    "type": "manual_or_image",
    "importedAt": "2026-06-18T09:00:00+09:00",
    "uploadedBy": "DiscordUserId",
    "originalFileName": "menu.jpg"
  },
  "menus": {
    "2026-06-18": {
      "a": "サムギョプサル丼",
      "b": "ジャージャー麺"
    },
    "2026-06-20": {
      "closed": true
    }
  }
}
```

### 3.3 初期メニューデータ

`menus/2026-06.json` として以下のデータを用意する。

```json
{
  "month": "2026-06",
  "location": "K3号館2階 フードコートかもめ",
  "source": {
    "type": "manual",
    "importedAt": null,
    "uploadedBy": null,
    "originalFileName": null
  },
  "menus": {
    "2026-06-01": { "a": "チーズタッカルビ定食", "b": "カレーまぜそば" },
    "2026-06-02": { "a": "回鍋肉定食", "b": "コーンバター味噌ラーメン" },
    "2026-06-03": { "a": "パイコー飯", "b": "群馬ひもかわうどん" },
    "2026-06-04": { "a": "ロコモコボウル", "b": "鶏塩チャーシュー麺" },
    "2026-06-05": { "a": "ビビンバ丼", "b": "担々麺" },
    "2026-06-06": { "closed": true },
    "2026-06-08": { "a": "チキン丼", "b": "魚介つけ麺" },
    "2026-06-09": { "a": "ヤンニョムチキン定食", "b": "ねばねばキムチうどん" },
    "2026-06-10": { "a": "豚しゃぶ定食", "b": "醤油ラーメン" },
    "2026-06-11": { "a": "チキン南蛮定食", "b": "肉うどん" },
    "2026-06-12": { "a": "タコライス", "b": "海老のトマトクリームパスタ" },
    "2026-06-13": { "closed": true },
    "2026-06-15": { "a": "北海道豚丼", "b": "台湾ラーメン" },
    "2026-06-16": { "a": "BBQチキングリル定食", "b": "ベーコンと小松菜の和風パスタ" },
    "2026-06-17": { "a": "ダブル味噌カツ丼", "b": "家系とんこつ醤油ラーメン" },
    "2026-06-18": { "a": "サムギョプサル丼", "b": "ジャージャー麺" },
    "2026-06-19": { "a": "鶏肉の香草焼き定食", "b": "塩たんめん" },
    "2026-06-20": { "closed": true },
    "2026-06-22": { "a": "マヌルカンジャンから揚げ定食", "b": "茄子のボロネーゼ" },
    "2026-06-23": { "a": "ダブルソースカツ丼", "b": "サラダうどん" },
    "2026-06-24": { "a": "麻婆豆腐定食", "b": "から揚げラーメンサラダ" },
    "2026-06-25": { "a": "鶏そぼろのバクダン丼", "b": "鶏中華そば" },
    "2026-06-26": { "a": "チリマヨから揚げ定食", "b": "2色パスタ" },
    "2026-06-27": { "closed": true },
    "2026-06-29": { "a": "タンドリーチキングリル定食", "b": "博多ラーメン" },
    "2026-06-30": { "a": "トンテキ丼", "b": "油そば" }
  }
}
```

---

## 4. 開発者権限

### 4.1 開発者判定

管理系コマンドは開発者のみ実行可能にする。

開発者判定はDiscordのユーザーIDで行う。

`.env` に以下を追加する。

```env
DEVELOPER_USER_IDS=123456789012345678,234567890123456789
```

複数人いる場合はカンマ区切り。

### 4.2 権限の考え方

- サーバー管理者権限では判定しない
- Discordロールでは判定しない
- コマンドを実行したユーザーのDiscordユーザーIDだけを見る
- 開発者IDに含まれていれば、どのサーバーからでも実行可能
- 開発者IDに含まれていなければ、サーバー管理者でも実行不可

### 4.3 開発者以外が実行した場合

```txt
このコマンドは開発者のみ使用できます。
```

可能ならephemeralで返信する。

---

## 5. 画像アップロードによる自動JSON化機能

### 5.1 概要

開発者がメニュー画像をDiscordにアップロードすると、Botが画像から文字を読み取り、メニューJSONの候補を生成する。

ただし、OCRや画像認識は誤読する可能性があるため、生成結果は即保存しない。

必ず以下の流れにする。

1. `/menu-import` で画像をアップロード
2. JSON候補を生成
3. `/menu-import-preview` で確認
4. `/menu-import-confirm` で正式保存
5. 不要なら `/menu-import-cancel` で破棄

### 5.2 `/menu-import`

画像からJSON候補を生成する。

入力例：

```txt
/menu-import month:2026-06 image:menu.jpg
```

引数：

| 引数 | 必須 | 内容 |
|---|---|---|
| month | 必須 | 対象年月。例：2026-06 |
| image | 必須 | メニュー画像 |
| location | 任意 | 食堂名。未指定なら既定値を使用 |

対応形式：

- jpg
- jpeg
- png
- webp

処理：

1. 開発者チェック
2. 添付画像の形式チェック
3. 画像サイズチェック
4. 画像を一時保存
5. OCR処理
6. メニューJSON候補を生成
7. JSONバリデーション
8. `temp/imports/IMPORT_ID.json` に一時保存
9. Discordにimport_idを返す

### 5.3 `/menu-import-preview`

生成されたJSON候補を確認する。

入力例：

```txt
/menu-import-preview import_id:abc123
```

処理：

1. 開発者チェック
2. import_idに対応する一時JSONを取得
3. 見やすく整形して表示

### 5.4 `/menu-import-confirm`

JSON候補を正式保存する。

入力例：

```txt
/menu-import-confirm import_id:abc123
```

処理：

1. 開発者チェック
2. import_idに対応する一時JSONを取得
3. JSONバリデーション
4. 既存の `menus/YYYY-MM.json` がある場合はバックアップ作成
5. 新しいJSONを `menus/YYYY-MM.json` に保存
6. 一時JSONを削除
7. 保存完了メッセージを返す

出力例：

```txt
2026年6月のメニューデータを保存しました。
この変更はBotが参加しているすべてのサーバーで反映されます。
バックアップも作成済みです。
```

### 5.5 `/menu-import-cancel`

生成されたJSON候補を破棄する。

入力例：

```txt
/menu-import-cancel import_id:abc123
```

出力例：

```txt
インポート候補を破棄しました。
```

---

## 6. 自動通知機能

### 6.1 概要

指定した時刻に、今日のメニューを自動投稿する。

初期設定：

```txt
毎日 9:00
```

### 6.2 投稿先

メニュー内容はBot全体で共通だが、通知先チャンネルは複数指定可能にする。

`.env` 例：

```env
MENU_CHANNEL_IDS=111111111111111111,222222222222222222
```

自動投稿時は、指定されたすべてのチャンネルに投稿する。

---

## 7. 環境変数

`.env.example` を作成すること。

```env
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=
DEVELOPER_USER_IDS=
MENU_CHANNEL_IDS=
TIMEZONE=Asia/Tokyo
DAILY_POST_TIME=09:00
IMPORT_EXPIRE_MINUTES=30
OCR_PROVIDER=mock
OCR_API_KEY=
```

注意：

- `.env` はGitHubにアップロードしない
- `.gitignore` に `.env` を追加する
- BotトークンやOCR用APIキーをコードに直書きしない

---

## 8. 推奨ファイル構成

```txt
C:\kamome_bot/
├─ src/
│  ├─ index.js
│  ├─ commands/
│  │  ├─ menu.js
│  │  ├─ menuImport.js
│  │  ├─ menuImportPreview.js
│  │  ├─ menuImportConfirm.js
│  │  └─ menuImportCancel.js
│  ├─ services/
│  │  ├─ menuService.js
│  │  ├─ imageImportService.js
│  │  ├─ ocrService.js
│  │  └─ permissionService.js
│  ├─ scheduler/
│  │  └─ dailyPost.js
│  └─ utils/
│     ├─ dateUtil.js
│     ├─ jsonValidator.js
│     └─ fileUtil.js
├─ menus/
│  ├─ 2026-06.json
│  └─ backups/
├─ temp/
│  └─ imports/
├─ .env.example
├─ .gitignore
├─ package.json
└─ README.md
```

---

## 9. 各ファイルの役割

### `src/index.js`

- Bot起動
- Discordログイン
- コマンド登録
- InteractionCreateイベント処理
- 自動投稿スケジューラー起動

### `src/commands/menu.js`

- `/menu` の処理
- 今日または指定日のメニュー取得
- Discordへの返信

### `src/commands/menuImport.js`

- `/menu-import` の処理
- 開発者チェック
- 画像受け取り
- OCR処理呼び出し
- JSON候補生成

### `src/commands/menuImportPreview.js`

- 一時JSON候補の表示

### `src/commands/menuImportConfirm.js`

- 一時JSON候補の正式保存
- バックアップ作成

### `src/commands/menuImportCancel.js`

- 一時JSON候補の破棄

### `src/services/permissionService.js`

- 開発者IDチェック

### `src/services/menuService.js`

- メニューJSONの読み込み
- 日付ごとのメニュー検索
- 保存処理

### `src/services/ocrService.js`

- 画像から文字を読み取る
- OCR方式を差し替えできるようにする
- 初期実装ではmockでもよい

### `src/services/imageImportService.js`

- OCR結果をメニューJSONに変換
- 日付、日替わりA、日替わりB、お休みを抽出

### `src/utils/dateUtil.js`

- 日本時間の日付取得
- `6/18` を `YYYY-MM-DD` に変換
- 表示用の日付文字列生成

### `src/utils/jsonValidator.js`

- JSON形式チェック
- 不正データの検出

### `src/utils/fileUtil.js`

- ファイル保存
- バックアップ作成
- 一時ファイル削除

---

## 10. JSONバリデーション仕様

保存前に必ず以下を確認する。

### 10.1 必須項目

- `month` が存在する
- `location` が存在する
- `menus` が存在する
- 各日付が `YYYY-MM-DD` 形式である

### 10.2 通常営業日

```json
{
  "a": "メニュー名",
  "b": "メニュー名"
}
```

`a` と `b` は空文字不可。

### 10.3 休業日

```json
{
  "closed": true
}
```

`closed: true` と `a` / `b` を同時に持たせない。

### 10.4 対象月チェック

`month` が `2026-06` の場合、`menus` 内の日付はすべて `2026-06-XX` であること。

---

## 11. バックアップ仕様

既存ファイルを上書きする場合、必ずバックアップを作成する。

バックアップ先：

```txt
menus/backups/YYYY-MM_YYYYMMDD_HHMMSS.json
```

例：

```txt
menus/backups/2026-06_20260618_090000.json
```

---

## 12. セキュリティ要件

- `.env` をGitHubに上げない
- Botトークンをコード内に書かない
- OCR用APIキーをコード内に書かない
- 開発者チェックはBot側で必ず行う
- Discordのコマンド表示制限だけに頼らない
- 開発者以外の管理コマンドは処理しない
- 画像ファイルサイズに上限を設ける
- 想定外の拡張子は拒否する
- 一時ファイルは定期削除する

---

## 13. 完成条件

以下をすべて満たしたら完成とする。

- Botが正常に起動する
- `/menu` で今日のメニューを表示できる
- `/menu date:6/18` のように日付指定できる
- お休みの日は休業表示になる
- メニューデータは全サーバー共通で読み込まれる
- 開発者のみ画像インポート系コマンドを実行できる
- 開発者であれば、どのサーバーからでも更新可能
- 開発者以外は更新できない
- 画像からJSON候補を生成できる
- confirmするまで正式保存されない
- 保存時にバックアップが作成される
- 保存後、すべてのサーバーで更新後メニューが表示される
- READMEにセットアップ方法と起動方法が書かれている

---

## 14. Codexへの実装指示

まずは以下の順番で実装すること。

1. `C:\kamome_bot` をプロジェクトルートとしてNode.jsプロジェクトを初期化
2. discord.js / dotenv / node-cron を導入
3. `.env.example` と `.gitignore` を作成
4. 基本的なBot起動処理を作成
5. `/menu` コマンドを作成
6. `menus/2026-06.json` を作成
7. メニュー読み込み処理を作成
8. 日本時間の日付処理を作成
9. 自動通知処理を作成
10. 開発者権限チェックを作成
11. `/menu-import` 系コマンドを作成
12. OCR部分はまずmockで実装
13. JSONプレビュー、confirm、cancelを実装
14. バックアップ処理を実装
15. READMEを作成

初期実装ではOCRの精度より、Bot全体の流れが正しく動くことを優先する。

