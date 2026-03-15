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
    'Notion-Version': version ?? '2022-06-28',
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

export function saveToNotion(data: ReceiptData): NotionSaveResult{
  try {
    logStatus('NOTION_SAVE_STARTED');

    const databaseId = getProp("NOTION_DATABASE_ID");
    const dataSourceId = resolveDataSourceId(databaseId);
    const headers = getNotionHeaders();

    logStatus('NOTION_API_VERSION', {
      version: headers['Notion-Version']
    });

    const body = {
      parent: { data_source_id: dataSourceId },
      properties: {
        店名: {
          title: [{ text: { content: data.storeName } }],
        },
        金額: {
          number: data.amount
        },
        日付: {
          date: { start: data.date },
        },
        ジャンル: {
          select: { name: data.category },
        },
        決済方法: {
          select: { name: data.paymentMethod },
        },
        確認ステータス: {
          select: { name: '未確認' as ConfirmationStatus },
        },
      },
    };

    const result = safeFetch(`${NOTION_API_BASE}/pages`, {
      method: 'post',
      headers: headers as unknown as Record<string, string>,
      payload: JSON.stringify(body),
    });

    const page = JSON.parse(result.text);

    if (result.code !== 200) {
      throw new Error(`Notion API error: ${result.code} - ${result.text}`);
    }

    logStatus('NOTION_SAVE_SUCCESS', { pageId: page.id });
    return { success: true, pageId: page.id };
  } catch (error) {
    logError('saveToNotion', error as Error);
    logStatus('NOTION_SAVE_FAILED', { error: (error as Error).message })
    return { success: false, error: (error as Error).message };
  }
}
