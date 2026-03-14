import { getProp, validateEnv } from './config';
import { saveToNotion } from './services/notion';
import { logError, logStatus } from './lib/logger';
import { ReceiptData, Category, PaymentMethod } from './types';

export function testNotionDatabaseConnection(): void {
  try {
    validateEnv();

    const testData: ReceiptData = {
      storeName: 'テスト店舗',
      amount: 100,
      date: '2026-01-01-00:00',
      category: 'その他' as Category,
      paymentMethod: '現金' as PaymentMethod,
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
