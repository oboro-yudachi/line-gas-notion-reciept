import { getProp } from "../config";
import { logError, logStatus } from "../lib/logger";

const LINE_API_BASE = `https://api-data.line.me/v2/bot/`
const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

export function getImageFromLine(messageId: string): GoogleAppsScript.Base.Blob {
  const accessToken = getProp('LINE_ACCESS_TOKEN');
  const url = `${LINE_API_BASE}/message/${messageId}/content`

  const resp = UrlFetchApp.fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
  });

  logStatus('IMAGE_FETCH_SUCCESS', { messageId });
  return resp.getBlob();
}

function sendLineMessage(
  url: string,
  body: Record<string, unknown>,
  context: string
): void {
  const token = getProp('LINE_ACCESS_TOKEN');

  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      payload: JSON.stringify(body),
    });
  } catch (error) {
    logError(context, error as Error);
  }
}

export function replyToUser(replyToken: string, message: string): void {
  sendLineMessage(
    LINE_REPLY_URL,
    { replyToken, messages: [{ type: 'text', text: message }] },
    'replyToUser'
  );
}

export function notifyUser(userId: string, message: string): void {
  sendLineMessage(
    LINE_PUSH_URL,
    { to: userId, messages: [{ type: 'text', text: message }] },
    'notifyUser'
  );
}
