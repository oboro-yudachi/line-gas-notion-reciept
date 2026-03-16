// =============================================================================
// src/types.ts - プロジェクト共通型定義
// =============================================================================

// ---------------------------------------------------------------------------
// レシート解析結果（Gemini → main → Notion の流れで使用）
// ---------------------------------------------------------------------------

/**
 * Gemini によるレシート解析結果。
 * analyzeReceiptWithGemini() の戻り値 / saveToNotion() の引数。
 */
export interface ReceiptData {
  storeName: string;
  amount: number;
  /** 現状: "YYYY-MM-DD-HH:MM" 形式。Phase 5 で ISO 8601 に移行予定 */
  date: string;
}

// ---------------------------------------------------------------------------
// Notion 保存結果
// ---------------------------------------------------------------------------

/** saveToNotion() の戻り値 / createResultMessage() の引数 */
export interface NotionSaveResult {
  success: boolean;
  pageId?: string;
  error?: string;
}

/** Notion ページ作成時の確認ステータス初期値 */
export type ConfirmationStatus = '未確認';

// ---------------------------------------------------------------------------
// Notion API ヘッダー
// ---------------------------------------------------------------------------

/** getNotionHeaders() の戻り値 */
export interface NotionHeaders {
  Authorization: string;
  'Content-Type': string;
  'Notion-Version': string;
}

/** Notion API バージョン */
export type NotionApiVersion = '2025-09-03' | '2022-06-28';

// ---------------------------------------------------------------------------
// 環境変数（PropertiesService のキー）
// ---------------------------------------------------------------------------

/** validateEnv() の required + resolveDataSourceId() で使うキー */
export type ScriptPropertyKey =
  | 'LINE_ACCESS_TOKEN'
  | 'LINE_CHANNEL_SECRET'
  | 'GEMINI_API_KEY'
  | 'NOTION_API_KEY'
  | 'NOTION_DATABASE_ID'
  | 'NOTION_DATA_SOURCE_ID';

// ---------------------------------------------------------------------------
// HTTP ヘルパー
// ---------------------------------------------------------------------------

/** safeFetch() の戻り値 */
export interface FetchResult {
  code: number;
  text: string;
  resp: GoogleAppsScript.URL_Fetch.HTTPResponse;
}

// ---------------------------------------------------------------------------
// LINE Webhook イベント（handleEvent で実際に参照されるフィールドのみ）
// ---------------------------------------------------------------------------

/** LINE Webhook のメッセージタイプ（handleEvent で分岐に使用） */
export type LineMessageType = 'text' | 'image';

/** LINE Webhook メッセージ（handleEvent で参照するフィールド） */
export interface LineMessage {
  type: LineMessageType | string;  // 未知のタイプも受け付ける
  id: string;
  text?: string;  // type === 'text' の場合のみ
}

/** LINE Webhook イベントソース */
export interface LineEventSource {
  userId: string;
  type?: string;
}

/** LINE Webhook イベント（doPost → handleEvent で使用） */
export interface LineWebhookEvent {
  type: 'message' | string;
  replyToken: string;
  source?: LineEventSource;
  message?: LineMessage;
}

/** LINE Webhook リクエストボディ（doPost で JSON.parse した結果） */
export interface LineWebhookBody {
  events: LineWebhookEvent[];
}

// ---------------------------------------------------------------------------
// ログ関連
// ---------------------------------------------------------------------------

/** logStatus() の stage 引数で使われるステータス名 */
export type LogStage =
  | 'PROCESSING_STARTED'
  | 'INVALID_EVENT_TYPE'
  | 'TEXT_MESSAGE_PROCESSED'
  | 'NON_IMAGE_MESSAGE'
  | 'RECEIPT_ANALYSIS_STARTED'
  | 'IMAGE_FETCH_FAILED'
  | 'IMAGE_FETCH_SUCCESS'
  | 'GEMINI_ANALYSIS_STARTED'
  | 'GEMINI_ANALYSIS_FAILED'
  | 'GEMINI_ANALYSIS_SUCCESS'
  | 'NOTION_SAVE_STARTED'
  | 'NOTION_SAVE_FAILED'
  | 'NOTION_SAVE_SUCCESS'
  | 'NOTION_DATASOURCE_SUCCESS'
  | 'NOTION_DATASOURCE_DISCOVERY_FAILED'
  | 'NOTION_API_VERSION'
  | 'PROCESS_COMPLETE'
  | 'PROCESS_ERROR'
  | 'LINE_BOT_CONNECTION_SUCCESS';
