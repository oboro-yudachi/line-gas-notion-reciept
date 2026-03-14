import { getProp } from "../config";
import { logError, logStatus } from "../lib/logger";
import { safeFetch } from "../lib/http";
import {
  ReceiptData,
  NotionSaveResult,
  NotionHeaders,
  NotionApiVersion,
  ConfirmationStatus,
  ScriptPropertyKey
} from "../types";

const NOTION_API_BASE = 'https://api.notion.com/v1';

function getNotionHeaders(version?: NotionApiVersion): NotionHeaders {
  return {
    Authorization: `Bearer ${getProp("NOTION_API_KEY")}`,
    'Content-Type': 'application/json',
    'Notion-Version': version as ?? '2022-06-28',
  };
}

function formatDatabaseId(rawId: string): string {
  if (rawId.includes('-')) return rawId;
  return `${rawId.slice(0, 8)}-${rawId.slice(8, 12)}-${rawId.slice(12, 16)}-${rawId.slice(16, 20)}-${rawId.slice(20)}`;
}

function resolveDataSourceId(databaseId: string): string {
  const cached = getProp('NOTION_DATA_SOURCE_ID' as ScriptPropertyKey);
  if (cached) return cached;

  const headers = getNotionHeaders();
  const formattedId = formatDatabaseId(databaseId);
  const result = safeFetch(`${NOTION_API_BASE}/databases/${formattedId}`, {
    method: 'get',
    headers: headers as unknown as Record<string, string>,
  });

  const json = JSON.parse(result.text);
  const dataSourceId = json.id;

  PropertiesService.getScriptProperties().setProperty('NOTION_DATA_SOURCE_ID', dataSourceId)

  logStatus('NOTION_DATASOURCE_SUCCESS', { dataSourceId });
  return dataSourceId;
}

export function saveToNotion(data: any) {
  const databaseId = getProp('NOTION_DATABASE_ID');

  // data_source_id を解決（失敗時はフォールバック）
  let dsId = null;
  try {
    dsId = resolveDataSourceId();
    logStatus('NOTION_DATASOURCE_SUCCESS', 'system', { dataSourceId: dsId });
  } catch (e) {
    logStatus('NOTION_DATASOURCE_DISCOVERY_FAILED', 'system', { error: String(e) });
  }

  // 親の切り替え
  const parentObj = dsId ? { data_source_id: dsId } : { database_id: formatDatabaseId(databaseId) };

  // Notion-Version の切り替え（dsId があれば新バージョン）
  const headers = getNotionHeaders(Boolean(dsId));

  logStatus('NOTION_API_VERSION', 'system', {
    version: headers['Notion-Version'],
    parentType: dsId ? 'data_source_id' : 'database_id'
  });

  // 日付整形
  let notionDate;
  try {
    const [y,m,d,hm] = String(data.date || '').split('-');
    const time = hm || '00:00';
    notionDate = `${y}-${m}-${d}T${time}:00.000+09:00`;
  } catch (_) {
    notionDate = new Date().toISOString();
  }
  const amount = Number(data.amount) || 0;

  const payload = {
    parent: parentObj,
    properties: {
      '店名': { 'title': [{ 'text': { 'content': data.storeName || '不明' } }] },
      '金額': { 'number': amount },
      '日付': { 'date': { 'start': notionDate } },
      'ジャンル': { 'select': { 'name': data.category || 'その他' } },
      '決済方法': { 'select': { 'name': data.paymentMethod || '不明' } },
      '確認ステータス': { 'select': { 'name': '未確認' } }
    }
  };

  try {
    const url = 'https://api.notion.com/v1/pages';
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = resp.getResponseCode();
    if (code !== 200) {
      throw new Error(`saveToNotion failed: ${code} ${resp.getContentText()}`);
    }
    const body = JSON.parse(resp.getContentText());
    return { success: true, pageId: body.id };
  } catch (error) {
    logError('saveToNotion', error);
    return { success: false, error: String(error) };
  }
}

