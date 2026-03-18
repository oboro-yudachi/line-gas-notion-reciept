import { getProp, GEMINI_PROMPT } from "../config";
import { logError, logStatus } from "../lib/logger";
import { ReceiptData } from "../types";

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

export function analyzeReceiptWithGemini(
  imageBlob: GoogleAppsScript.Base.Blob
): ReceiptData {
  const apiKey = getProp('GEMINI_API_KEY');

  const base64Image = Utilities.base64Encode(imageBlob.getBytes());
  const mimeType = imageBlob.getContentType() ?? 'image/jpeg';

  const payload = {
    contents: [{
      parts: [
        { text: GEMINI_PROMPT },
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
      date: new Date().toISOString().slice(0, 10),
    };
  }
}
