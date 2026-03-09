## 概要

LINE で受け取ったレシート画像を **Gemini で解析**し、結果を **Notion のデータベースに保存**する Google Apps Script（GAS）プロジェクトです。

- LINE（Webhook）→ GAS（Webアプリ）→ Gemini → Notion
- ローカル開発は TypeScript + Rollup、デプロイは `clasp push` で行います

この README 内に、初回セットアップ手順の詳細まで含めています（別ページ参照なしで完結します）。

## 特徴

- LINE から画像を送るだけで Notion にレシート情報を記録
- TypeScript で開発できる（型が効く）
- Rollup でバンドルして GAS にデプロイ（`dist/` を push）

## アーキテクチャ

1. LINE Webhook が GAS の `doPost` を呼ぶ
2. 画像を LINE API から取得
3. Gemini API で画像解析
4. Notion API でページ作成

## 必要なもの

- Node.js（v18 以上推奨）
- npm
- [clasp](https://github.com/google/clasp)
    
    ```
    npm install -g @google/clasp
    ```
    
- Google アカウント（GAS プロジェクト作成・デプロイ権限）
- LINE Developers のアカウント
- Notion のインテグレーション（APIキー）
- Gemini API のキー

## セットアップ（初回）

### 1) LINE（Messaging API）

1. [LINE Developers](https://developers.line.biz/console/) にログイン
2. Provider（プロバイダー）を作成（任意の名前でOK）
3. Provider 配下で **Messaging API チャネル**を作成
    - チャネル名、説明などを入力して作成
    - 作成後に「チャネル基本設定」「Messaging API設定」へ進める状態になります
4. [manager.line.biz](http://manager.line.biz) にログインし、作成した公式アカウントを開く
5. 公式アカウント設定
    - 「ホーム」→「応答メッセージ」→ 自動返信メッセージを **オフ**
    - 「設定」→「Messaging API」→ API設定を有効化（チャネル紐付け）

#### LINE のキー取得

後で GAS のスクリプトプロパティに設定します。

- `LINE_ACCESS_TOKEN`
    - LINE Developers → 「Messaging API設定」→ 「チャネルアクセストークン」→ 発行
- `LINE_CHANNEL_SECRET`
    - LINE Developers → 「チャネル基本設定」→ 「チャネルシークレット」

### 2) Notion（保存先DB）

1. 保存先のデータベースを用意（DBプロパティ要件を満たすこと）
2. Notion でインテグレーションを作成
    - Notion の「設定」→「インテグレーション」から新規作成
    - 発行されたシークレットを `NOTION_API_KEY` として控える
3. 保存先DBをインテグレーションに共有
    - DBページ右上の「共有」から、作成したインテグレーションを招待してアクセス権を付与
4. `NOTION_DATABASE_ID` を取得
    - 保存先DBの「リンクをコピー」
    - URL の `notion.so/` の直後から `?` の手前までを取り出す（32桁のID部分）

#### DBプロパティ要件（厳守）

実装がこのプロパティ名を参照します。

| タイプ | プロパティ名 |
| --- | --- |
| 名前（title） | 店名 |
| 数値 | 金額 |
| 日付 | 日付 |
| セレクト | ジャンル |
| セレクト | 決済方法 |
| セレクト | 確認ステータス |

### 3) GAS（デプロイ）

1. [Apps Script](https://script.google.com/home) でプロジェクトを作成
    - 既存プロジェクトを使う場合はスクリプトID（`scriptId`）を控える
2. スクリプトプロパティを設定
    - 左メニュー「プロジェクトの設定」
    - 下部「スクリプト プロパティ」に必要キーを追加（次セクション参照）
3. Webアプリとしてデプロイ
    - 右上「デプロイ」→「新しいデプロイ」
    - 種類は「ウェブアプリ」
    - 「アクセスできるユーザー」を **全員**
    - 初回は承認が必要。警告画面が出たら「Advanced」→「Go to ...」から進み許可
    - デプロイ後に表示される **ウェブアプリURL** を控える（Webhook に使う）
4. LINE Developers に Webhook URL を設定
    - LINE Developers → 「Messaging API設定」
    - Webhook URL に 3. で控えたウェブアプリURL を貼り付け
    - 「Webhookの利用」を **オン**
    - 疎通確認: LINE から Bot にテキスト送信して `テストOK` が返れば最低限 OK（実装により異なる）

## 設定（スクリプトプロパティ）

GAS のスクリプトプロパティに以下を設定します。

```
LINE_ACCESS_TOKEN
LINE_CHANNEL_SECRET
GEMINI_API_KEY
NOTION_API_KEY
NOTION_DATABASE_ID
```

- `LINE_ACCESS_TOKEN`: LINE Developers → Messaging API設定 → チャネルアクセストークン
- `LINE_CHANNEL_SECRET`: LINE Developers → チャネル基本設定 → チャネルシークレット
- `GEMINI_API_KEY`: Gemini API のキー
- `NOTION_API_KEY`: Notion インテグレーションのシークレット
- `NOTION_DATABASE_ID`: 保存先DBのURLから取得（`notion.so/` の後ろ〜 `?` 手前）

## デプロイ（Webhook）

1. GAS を Webアプリとしてデプロイ
    - 右上「デプロイ」→「新しいデプロイ」→（種類）「ウェブアプリ」
    - 「アクセスできるユーザー」を **全員**
    - 初回承認: 「Advanced」→「Go to ...」から進み、必要な権限を許可
    - デプロイ完了後に表示される **ウェブアプリURL** をコピー
2. LINE Developers の Webhook に GAS の WebアプリURL を設定
    - LINE Developers → 「Messaging API設定」
    - Webhook URL に貼り付け
    - 「Webhookの利用」を **オン**
    - （必要なら）「Webhook URL の検証」を実行して 200 が返ることを確認

## ローカル開発

### インストール

1. リポジトリをクローン
    
    ```
    git clone <リポジトリURL>
    cd <リポジトリ名>
    ```
    
2. 依存パッケージをインストール
    
    ```
    npm install
    ```
    
3. clasp にログイン（初回のみ）
    
    ```
    clasp login
    ```
    
4. `.clasp.json` を確認
    
    ```
    {
      "scriptId": "<対象プロジェクトのスクリプトID>",
      "rootDir": "dist"
    }
    ```
    
    ※ Rollup の出力先（`dist/`）を push 対象にするため `rootDir` は `dist` です。
    

### 使い方（編集 → ビルド → デプロイ）

GitHub と GAS は **自動同期されない** ため、`clasp push` と `git push` は別々に行います。

1. `src/` を編集
2. `npm run build`
3. `clasp push`
4. 動作確認
5. `git add / commit / push`

### Scripts

- `npm run build`: Rollup で `dist/` を生成（+ `appsscript.json` を `dist/` にコピー）
- `npm run push`: 用意している場合は build + clasp push を一括（READMEに合わせて運用）

### 注意

- `dist/` は生成物なので `.gitignore` で除外します。
- Rollup には `rollup-plugin-gas` を使用しています。
- `clasp push` は GAS のファイルを **丸ごと上書き** します。

## ディレクトリ構成

```
src/
├── main.ts          # エントリポイント（doPost など）
├── config.ts        # 定数・設定値
├── lineHandler.ts   # LINE Webhook のメッセージ処理
├── notionClient.ts  # Notion API との通信
├── parser.ts        # レシート文字列のパース
└── types.ts         # 共通の型定義
```

## トラブルシューティング

### 間違えて PR をマージした場合のリバート

GitHub 上で誤って `main` にマージしてしまった場合、以下の手順で元に戻します。

1. GitHub 上でリバート PR を作成してマージ
2. ローカルで `git pull` してから `clasp push` で GAS 側へ反映

## Contributing

- Issue / PR 歓迎
- 作業は `feature/*` ブランチで行い、完了後に `main` にマージします

## License

- 個人用プロジェクト（必要に応じて追記）

### ブランチ運用（推奨）

| ブランチ | 用途 |
| --- | --- |
| `main` | 安定版（GAS にデプロイ済み） |
| `feature/*` | 各 Phase / ToDo 単位の作業ブランチ |

作業完了 → `main` にマージ → `clasp push` の順で反映します。

## プロジェクト構成

```
src/
├── main.ts          # エントリポイント（doPost など）
├── config.ts        # 定数・設定値
├── lineHandler.ts   # LINE Webhook のメッセージ処理
├── notionClient.ts  # Notion API との通信
├── parser.ts        # レシート文字列のパース
└── types.ts         # 共通の型定義
```

> ファイル構成はリファクタリングの進行に伴い変更される場合があります。最新の状態は `src/` ディレクトリを直接確認してください。
> 

## トラブルシューティング

### 間違えて PR をマージした場合のリバート

GitHub 上で誤って `main` にマージしてしまった場合、以下の手順で元に戻します。

### 1. GitHub 上でリバート PR を作成

マージ済み PR のページ下部に「**Revert**」ボタンがあるのでクリックし、リバート PR を作成・マージする。
または CLI で操作：
git checkout main
git pull origin main
git revert -m 1 <マージコミットのSHA>
git push origin main

> `-m 1` はマージコミットの第1親（マージ先 = `main`）を残す指定。通常のマージ PR リバートでは `-m 1` で OK。
> 

### 2. GAS をリバート後の状態に戻す

```
git pull origin main
clasp push
```

> ⚠️ `clasp push` を忘れると GAS 側はマージ済みのコードのままになるので、必ず Git リバート後に `clasp push` も実行すること。
> 

### 3. リバート後に同じ変更を再度マージしたい場合

リバートコミット自体をさらにリバート（revert the revert）するか、修正を加えた新しい PR を作成する。

``` 
git revert <リバートコミットのSHA>
git push origin main
clasp pusht
```
