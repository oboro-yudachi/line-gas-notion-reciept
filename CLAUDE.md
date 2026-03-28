# CLAUDE.md

このファイルはAIアシスタントがこのコードベースで作業する際のガイドです。

## プロジェクト概要

LINE Botを介してレシートの処理を自動化するGoogle Apps Script（GAS）プロジェクトです。

- **入力**: ユーザーがLINE Botにレシート画像を送信
- **処理**: Gemini API（2.5 Flash Lite）が画像を解析し、レシートデータを抽出
- **出力**: レシートデータ（店名・金額・日付）をNotionデータベースに保存

**データフロー**: LINE Webhook → GAS Webアプリ → Gemini API → Notion API → LINE返信

## リポジトリ構成

```
line-gas-notion-reciept/
├── src/
│   ├── main.ts              # GASエントリーポイント（doPost, doGet）
│   ├── types.ts             # 共有型定義
│   ├── config.ts            # スクリプトプロパティの取得・バリデーション
│   ├── messageBuilder.ts    # LINE返信メッセージの整形
│   ├── tests.ts             # GASコンソール用の手動テスト関数
│   ├── appsscript.json      # GASプロジェクトメタデータ（ビルド時にdistにコピー）
│   ├── services/
│   │   ├── line.ts          # LINE Messaging API連携
│   │   ├── gemini.ts        # Gemini API連携
│   │   └── notion.ts        # Notion API連携
│   └── lib/
│       ├── http.ts          # safeFetch() HTTPラッパー
│       └── logger.ts        # logStatus() / logError() ログユーティリティ
├── dist/                    # ビルド出力 — 手動編集禁止
├── rollup.config.mjs        # Rollupビルド設定（出力形式: es、GASプラグイン使用）
├── tsconfig.json            # TypeScript設定（strict、ESNext、bundler解決）
├── package.json             # npmスクリプトと開発依存関係
├── .clasp.json              # clasp設定（scriptId、rootDir: dist）
└── README.md                # セットアップ・デプロイ手順ドキュメント
```

## 開発コマンド

```bash
npm run build   # RollupでTypeScriptをコンパイル → dist/
npm run push    # ビルド + claspでGASにデプロイ
npm run check   # 型チェックのみ（tsc --noEmit）
```

**ローカル開発サイクル**: `src/` を編集 → `npm run build` → `npm run push` → GASコンソールでテスト

## ビルドシステム

- **バンドラー**: Rollup（`@rollup/plugin-typescript` と `rollup-plugin-gas` を使用）
- 入力: `src/main.ts` → 出力: `dist/main.js`（ESモジュール形式）
- `rollup-plugin-gas`（`toplevel: true`）がESエクスポートをGASのグローバル関数に変換
- ビルド時に `appsscript.json` が `dist/` にコピーされる
- コンパイル後の出力から `export` 文が除去される

**重要**: `main.ts` からエクスポートされた関数のみがGASで呼び出し可能な関数になります。`tests.ts` のテスト関数は `main.ts` を通じて再エクスポートする必要があります。

## 実行環境

このコードは **Google Apps Script（V8ランタイム）上でのみ** 動作します。主な制約：

- `fetch()` 不可 → `UrlFetchApp.fetch()` を使用（`lib/http.ts` の `safeFetch()` でラップ済み）
- `console.log()` 不可 → `Logger.log()` を使用（`lib/logger.ts` でラップ済み）
- ファイルシステムアクセス不可 → `ScriptApp`、`DriveApp` などを使用
- ランタイムでnpmパッケージ不可 → すべてバンドルするかGAS組み込みAPIを使用
- `@types/google-apps-script` がGAS APIのTypeScript型を提供

## 環境変数（スクリプトプロパティ）

設定はすべてGASのスクリプトプロパティで管理します（`.env` ファイルは使用しません）。`config.ts` の `getProp()` 経由でアクセスします。

| キー | 必須 | 用途 |
|------|------|------|
| `LINE_ACCESS_TOKEN` | 必須 | LINE Messaging APIチャネルアクセストークン |
| `LINE_CHANNEL_SECRET` | 必須 | LINEウェブフック署名検証用シークレット |
| `GEMINI_API_KEY` | 必須 | Google Gemini APIキー |
| `NOTION_API_KEY` | 必須 | Notionインテグレーションシークレット |
| `NOTION_DATABASE_ID` | 必須 | 保存先NotionデータベースID |
| `NOTION_DATA_SOURCE_ID` | 任意 | 初回DBクエリ後にキャッシュされるID |

GASの「プロジェクトの設定 > スクリプトプロパティ」から設定するか、`setupScriptProperties()` を実行します。

## コード規約

### 型定義（`types.ts`）
- `ReceiptData`: `{ storeName, amount, date }` — Geminiの解析結果
- `NotionSaveResult`: `{ success, pageId?, error? }` — Notion保存の結果
- `ScriptPropertyKey`: 有効なプロパティキー名のユニオン型
- `LogStage`: ログステージ識別子のユニオン型

### HTTPリクエスト
`UrlFetchApp` を直接呼び出さず、必ず `lib/http.ts` の `safeFetch()` を使用：
```typescript
const response = safeFetch(url, options); // muteHttpExceptions: true
```

### ログ出力
`Logger.log()` を直接呼び出さず、必ず `lib/logger.ts` の関数を使用：
```typescript
logStatus('STAGE_NAME', { key: value });
logError('STAGE_NAME', error, { context });
```

### エラーハンドリング
サービス関数は例外をスローせず、型付きの結果オブジェクトを返します。呼び出し元は `success` フラグを確認します：
```typescript
const result = saveToNotion(data);
if (!result.success) { /* エラー処理 */ }
```

### 設定アクセス
サービスファイルから `PropertiesService` を直接使わず、`getProp(key: ScriptPropertyKey)` を使用します。

## Notionデータベーススキーマ

保存先Notionデータベースには以下のプロパティが必要です：

| プロパティ名 | 型 | 備考 |
|------------|-----|------|
| 店名 | タイトル | 店舗名 |
| 金額 | 数値 | 金額（円） |
| 日付 | 日付 | レシート日付（YYYY-MM-DD） |
| 確認ステータス | セレクト | デフォルト: "未確認" |
| カテゴリ | セレクト | 現在は書き込み未使用 |
| 決済方法 | セレクト | 現在は書き込み未使用 |

## テスト

`src/tests.ts` にテスト関数が定義されており、`src/main.ts` から再エクスポートされています：

- `testLineBotConnection()` — LINEトークンの検証
- `testNotionDatabaseConnection()` — Notion接続とDBスキーマの検証
- `testGeminiAPIConnection()` — Gemini APIキーの検証

GASスクリプトエディタで関数を選択して「実行」ボタンをクリックして実行します。

## デプロイ手順

1. `npm run push` で `clasp push` が実行され、`dist/` がGASプロジェクトにアップロードされる
2. GASエディタで「デプロイ > 新しいデプロイ」（種類: ウェブアプリ）
3. 設定: 実行ユーザー = "自分"、アクセスできるユーザー = "全員"
4. ウェブアプリのURLをコピーし、LINE DevelopersコンソールのWebhook URLに設定
5. LINEチャネル設定で「Webhookの利用」を有効化

## ブランチ戦略

- `main`: 本番リリース済みコード
- フィーチャーブランチ: `claude/<説明>` など

## AIアシスタントへの重要な注意事項

1. **`dist/` は絶対に編集しない** — ビルドプロセスで自動生成されます
2. **GAS専用API**: `UrlFetchApp`、`Logger`、`ScriptApp`、`PropertiesService` などはランタイムでのみ利用可能 — `@types/google-apps-script` の型定義に依存すること
3. **async/await 不可** — GAS V8ランタイムはトップレベルの非同期をサポートしない。すべてのAPI呼び出しは同期処理
4. **Notionのプロパティ名**（`店名`、`金額`、`日付` など）は完全一致で保持すること
5. **LINE署名検証**（`doPost()` 内のHMAC-SHA256）をスキップしたり弱体化させないこと
6. **Geminiプロンプト**（`config.ts` の `GEMINI_PROMPT`）はJSONを返す — 変更する場合は `ReceiptData` の型定義と整合性を保つこと
7. コード変更後は必ず `npm run check` で型チェックを通過させてからプッシュすること
