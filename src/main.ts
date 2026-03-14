import { getProp, validateEnv } from "./config";
import { getImageFromLine, replyToUser } from "./services/line";
import { analyzeReceiptWithGemini } from "./services/gemini";
import { saveToNotion } from "./services/notion";
import { createResultMessage } from "./messageBuilder";
import { logError, logStatus } from "./lib/logger";
import {
  LineWebhookEvent,
  LineWebhookBody,
  ReceiptData,
  NotionSaveResult
} from "./types";

function validateSignature(body: string, signature: string): boolean {
  const secret = getProp('LINE_CHANNEL_SECRET');
  const hash = Utilities.computeHmacSha256Signature(
    body,
    secret
  );
  const expected = Utilities.base64Encode(hash);
  return expected === signature;
}

function handleEvent(event: LineWebhookEvent): void {
  logStatus('PROCESSING_STARTED', { type: event.type})

  if (event.type !== 'message') {
    logStatus('INVALID_EVENT_TYPE')
    return;
  }

  const message = event.message;
  if (!message) return;

  if (message.type === 'text') {
    logStatus('TEXT_MESSAGE_PROCESSED', { text: message.text });
    replyToUser(event.replyToken, `「${message.text}」を受け取りました`)
    return;
  }

  if (message.type !== 'image') {
    logStatus('NON_IMAGE_MESSAGE');
    return;
  }

  try {
    logStatus('RECEIPT_ANALYSIS_STARTED');

    const imageBlob = getImageFromLine(message.id);
    const receiptData: ReceiptData = analyzeReceiptWithGemini(imageBlob);
    const saveResult: NotionSaveResult = saveToNotion(receiptData);
    const resultMessage = createResultMessage(receiptData, saveResult);
    replyToUser(event.replyToken, resultMessage);

    logStatus('PROCESS_COMPLETE');
  } catch (error) {
    logError('handleEvent', error as Error);
    logStatus('PROCESS_ERROR', { error: (error as Error).message });
    replyToUser(event.replyToken, '処理中にエラーが発生しました');
  }
}

export function getWebhookUrl(): string {
  return ScriptApp.getService().getUrl();
}

export function doGet(): GoogleAppsScript.HTML.HtmlOutput {
  logStatus('PROCESSING_STARTED', {
    timestamp: new Date().toISOString(),
    deploymentId: ScriptApp.getScriptId(),
  });

  return HtmlService.createHtmlOutput(`
    <h1>レシート解析＆Notion連携システム v2.0</h1>
    <p>このWebアプリケーションはLINE Bot用のバックエンドサービスです。</p>
    <p>システムステータス: アクティブ</p>
    <p>最終更新: ${new Date().toLocaleString()}</p>
  `);
}

export function doPost(
  e: GoogleAppsScript.Events.DoPost
): GoogleAppsScript.Content.TextOutput {
  try {
    validateEnv();

    const body = e.postData.contents;
    const signature = e.parameter['x-line-signature']
      ?? e.postData.contents ?? '';

    if (!validateSignature(body, signature)) {
      return ContentService.createTextOutput('Invalid signature');
    }

    const webhookBody = JSON.parse(body) as LineWebhookBody;

    for (const event of webhookBody.events) {
      handleEvent(event);
    }

    return ContentService.createTextOutput('OK');
  } catch (error) {
    logError('doPost', error as Error)
    return ContentService.createTextOutput('Error');
  }
}

export { testNotionDatabaseConnection, testLineBotConnection } from './tests';
