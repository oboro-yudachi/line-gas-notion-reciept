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

export function handleEvent(event: any) {
  try {
    const userId = event.source ? event.source.userId : 'unknown';
    logStatus('PROCESSING_STARTED', userId, { eventType: event.type, messageType: event.message ? event.message.type : 'none' });

    if (event.type !== 'message') {
      logStatus('INVALID_EVENT_TYPE', userId, { eventType: event.type });
      return;
    }

    if (event.message.type === 'text') {
      replyToUser(event.replyToken, 'テストOK');
      logStatus('TEXT_MESSAGE_PROCESSED', userId, { text: event.message.text });
      return;
    }

    if (event.message.type !== 'image') {
      replyToUser(event.replyToken, 'レシートの写真を送信してください。');
      logStatus('NON_IMAGE_MESSAGE', userId, { messageType: event.message.type });
      return;
    }

    const messageId = event.message.id;
    const replyToken = event.replyToken;

    replyToUser(replyToken, 'レシートを解析しています...');
    logStatus('RECEIPT_ANALYSIS_STARTED', userId, { messageId: messageId });

    const imageData = getImageFromLine(messageId);
    if (!imageData) {
      notifyUser(userId, '画像の取得に失敗しました。もう一度試してください。');
      logStatus('IMAGE_FETCH_FAILED', userId, { messageId: messageId });
      return;
    }

    logStatus('IMAGE_FETCH_SUCCESS', userId, { messageId: messageId, size: imageData.length });

    const base64Image = Utilities.base64Encode(imageData);

    logStatus('GEMINI_ANALYSIS_STARTED', userId, { messageId: messageId });
    const analysisResult = analyzeReceiptWithGemini(base64Image);

    if (!analysisResult) {
      notifyUser(userId, 'レシートの解析に失敗しました。鮮明な写真で再度お試しください。');
      logStatus('GEMINI_ANALYSIS_FAILED', userId, { messageId: messageId });
      return;
    }

    logStatus('GEMINI_ANALYSIS_SUCCESS', userId, {
      messageId: messageId,
      storeName: analysisResult.storeName,
      amount: analysisResult.amount
    });

    logStatus('NOTION_SAVE_STARTED', userId, { messageId: messageId });
    const notionResult = saveToNotion(analysisResult);

    if (!notionResult.success) {
      logStatus('NOTION_SAVE_FAILED', userId, {
        messageId: messageId,
        error: notionResult.error
      });
    } else {
      logStatus('NOTION_SAVE_SUCCESS', userId, {
        messageId: messageId,
        pageId: notionResult.pageId
      });
    }

    const message = createResultMessage(analysisResult, notionResult);
    notifyUser(userId, message);

    logStatus('PROCESS_COMPLETE', userId, {
      messageId: messageId,
      success: true,
      storeName: analysisResult.storeName,
      amount: analysisResult.amount,
      notionSaved: notionResult.success
    });

  } catch (error) {
    const userId = event.source ? event.source.userId : 'unknown';
    logError('handleEvent', error);
    logStatus('PROCESS_ERROR', userId, { error: String(error) });

    try {
      notifyUser(userId, 'エラーが発生しました。しばらく経ってから再度お試しください。');
    } catch (e) {
      logError('notifyError', e);
    }
  }
}

export function doPost(e: any) {
  try {
    const requestInfo = {
      contentLength: e.postData ? e.postData.contents.length : 0,
      contentType: e.contentType || 'none',
      method: e.method || 'none',
      parameters: e.parameters ? JSON.stringify(e.parameters) : 'none',
      hasHeaders: !!e.headers,
      headerNames: e.headers ? Object.keys(e.headers) : []
    };

    let signature = null;

    if (e.headers) {
      const headerKeys = Object.keys(e.headers);
      for (const key of headerKeys) {
        if (key.toLowerCase().includes('line-signature')) {
          signature = e.headers[key];
          break;
        }
      }
    }

    if (!signature) {
      try {
        if (e.postData && e.postData.contents) {
          const data = JSON.parse(e.postData.contents);

          if (data.events && data.events.length > 0) {
            data.events.forEach((event: any) => {
              try {
                handleEvent(event);
              } catch (eventError) {
                logError('handleEvent in doPost', eventError);
              }
            });
          }
        }
      } catch (parseError) {
        logError('doPost-parse', parseError);
      }

      return ContentService.createTextOutput(JSON.stringify({
        'status': 'success',
        'message': 'Processed without signature validation'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const payload = e.postData.contents;
    if (!validateSignature(payload, signature)) {
      return ContentService.createTextOutput(JSON.stringify({
        'status': 'error',
        'message': 'Invalid signature'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(payload);
    if (data.events && data.events.length > 0) {
      data.events.forEach((event: any) => {
        handleEvent(event);
      });
    }

    return ContentService.createTextOutput(JSON.stringify({
      'status': 'success'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    logError('doPost', error);
    return ContentService.createTextOutput(JSON.stringify({
      'status': 'error',
      'message': String(error)
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

export function validateSignature(payload: any, signature: any) {
  try {
    const channelSecret = getProp('LINE_CHANNEL_SECRET');

    if (!channelSecret) {
      logError('validateSignature', 'Channel secret is not set in script properties');
      return false;
    }

    const hash = Utilities.computeHmacSha256Signature(payload, channelSecret)
                         .map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');

    return hash === signature;
  } catch (error) {
    logError('validateSignature', error);
    return false;
  }
}
