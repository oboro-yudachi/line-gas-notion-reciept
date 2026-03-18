import { getProp, validateEnv } from './config';
import { saveToNotion } from './services/notion';
import { logError, logStatus } from './lib/logger';
import { ReceiptData } from './types';

export function testNotionDatabaseConnection(): void {
  try {
    validateEnv();

    const testData: ReceiptData = {
      storeName: 'テスト店舗',
      amount: 100,
      date: '2026-01-01T00:00:00',
    };

    const result = saveToNotion(testData);

    if (result.success) {
      logStatus('LINE_BOT_CONNECTION_SUCCESS', {
        message: 'Notion DB connection OK',
        pageId: result.pageId,
      });
      console.log('✅ Notion 接続テスト成功: pageId =', result.pageId);
    } else {
      console.error('❌ Notion 接続テスト失敗:', result.error);
    }
  } catch (error) {
    logError('testNotionDatabaseConnection', error as Error);
    console.error('❌ テスト実行エラー:', (error as Error).message);
  }
}

export function testLineBotConnection(): void {
  try {
    validateEnv();

    const token = getProp('LINE_ACCESS_TOKEN');

    const resp = UrlFetchApp.fetch('https://api.line.me/v2/bot/info', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (resp.getResponseCode() === 200) {
      const botInfo = JSON.parse(resp.getContentText());
      logStatus('LINE_BOT_CONNECTION_SUCCESS', { botInfo });
      console.log('✅ LINE Bot 接続テスト成功:', botInfo.displayName);
    } else {
      console.error('❌ LINE Bot 接続テスト失敗: status =', resp.getResponseCode());
    }
  } catch (error) {
    logError('testLineBotConnection', error as Error);
    console.error('❌ テスト実行エラー:', (error as Error).message);
  }
}

export function testGeminiAPIConnection(): void {
  try {
    validateEnv();

    const apiKey = getProp('GEMINI_API_KEY');
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

    const payload = {
      contents: [
        {
          parts: [{ text: 'こんにちは。接続テストです。「OK」とだけ返してください。' }],
        },
      ],
    };

    const resp = UrlFetchApp.fetch(`${url}?key=${apiKey}`, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const code = resp.getResponseCode();
    const body = resp.getContentText();

    if (code === 200) {
      const result = JSON.parse(body);
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? '(no text)';
      console.log(`✅ Gemini API 接続テスト成功: ${text.trim()}`);
    } else {
      console.error(`❌ Gemini API 接続テスト失敗: status=${code}`);
      console.error(body);
    }
  } catch (error) {
    logError('testGeminiAPIConnection', error as Error);
    console.error('❌ テスト実行エラー:', (error as Error).message);
  }
}
