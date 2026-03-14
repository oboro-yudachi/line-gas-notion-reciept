import { getProp } from "../config";
import { logError, logStatus } from "../lib/logger";
import { ReceiptData, Category, PaymentMethod } from "../types";

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent';
export function analyzeReceiptWithGemini(
  imageBlob: GoogleAppsScript.Base.Blob
): ReceiptData {
  const apiKey = getProp('GEMINI_API_KEY');

  const base64Image = Utilities.base64Encode(imageBlob.getBytes());
  const mimeType = imageBlob.getContentType() ?? 'image/jpeg';

  const prompt = `このレシート画像を解析して、以下のJSON形式で返してください。
    JSON以外のテキストは含めないでください。
    {
      "storeName": "店名",
      "amount": 数値,
      "date": "YYYY-MM-DD-HH:MM",
      "category": "カテゴリ",
      "paymentMethod": "決済方法"
    }
    カテゴリ: カフェ/ファストフード/レストラン/コンビニ/スーパー/美容/ファッション/交通費/病院/娯楽/書店/家電/フィットネス/その他
    決済方法: 現金/クレジット/QRコード/電子マネー/不明`;

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image,
          },
        },
      ],
    }],
  };

  try {
    logStatus('GEMINI_ANALYSIS_STARTED');

    const resp = UrlFetchApp.fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    });

    const result = JSON.parse(resp.getContentText());
    const text = result.candidates[0].content.parts[0].text;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Gemini response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as ReceiptData;

    logStatus('GEMINI_ANALYSIS_SUCCESS', parsed);
    return parsed;
  } catch (error) {
    logError('analyzeReceiptWithGemini', error as Error);
    logStatus('GEMINI_ANALYSIS_FAILED', { error: (error as Error).message });

    return {
      storeName: "不明",
      amount: 0,
      date: new Date().toISOString().slice(0, 10) + "-00:00",
      category: "その他" as Category,
      paymentMethod: "不明" as PaymentMethod,
    };
  }
}
