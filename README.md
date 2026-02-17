## 開発環境セットアップ

### 前提条件

- Node.js（v18 以上推奨）
- npm
- [clasp](https://github.com/google/clasp) — Google Apps Script CLI

      npm install -g @google/clasp

- GAS プロジェクトへのアクセス権（Google アカウント）

### セットアップ手順

1. リポジトリをクローン

       git clone <リポジトリURL>
       cd <リポジトリ名>

2. 依存パッケージをインストール

       npm install

3. clasp にログイン（初回のみ）

       clasp login

   ブラウザが開くので Google アカウントで認証する。

4. `.clasp.json` の `scriptId` が対象の GAS プロジェクトを指していることを確認

       {
         "scriptId": "<対象プロジェクトのスクリプトID>",
         "rootDir": "src"
       }

ここまで完了すれば開発を始められます。

## 開発フロー

GitHub と GAS は **自動同期されない** ため、`clasp push` と `git push` は別々に行います。

1. **コード編集** — ローカルの `src/` 配下を編集
2. **`npx tsc`** — 型チェック（`noEmit: true` なので JS は出力しない）
3. **`clasp push`** — GAS へデプロイ（`.ts` を自動トランスパイルしてアップロード）
4. **GAS 上で動作確認** — LINE テスト送信 or GAS エディタからテスト関数を実行
5. **`git add / commit / push`** — GitHub にソースを保存

> ⚠️ `clasp push` は GAS のファイルを **丸ごと上書き** します。GAS エディタ上で直接編集した内容はローカルから push すると消えるので注意してください。

### ブランチ運用（推奨）

| ブランチ | 用途 |
| --- | --- |
| `main` | 安定版（GAS にデプロイ済み） |
| `feature/*` | 各 Phase / ToDo 単位の作業ブランチ |

作業完了 → `main` にマージ → `clasp push` の順で反映します。

## プロジェクト構成

    src/
    ├── main.ts          # エントリポイント（doPost など）
    ├── config.ts        # 定数・設定値
    ├── lineHandler.ts   # LINE Webhook のメッセージ処理
    ├── notionClient.ts  # Notion API との通信
    ├── parser.ts        # レシート文字列のパース
    └── types.ts         # 共通の型定義

> ファイル構成はリファクタリングの進行に伴い変更される場合があります。最新の状態は `src/` ディレクトリを直接確認してください。
