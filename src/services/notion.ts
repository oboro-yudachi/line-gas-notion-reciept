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

export function saveToNotion(data: string): string{
  try {
    logStatus('NOTION_SAVE_STARTED);

    const databaseId = getProp("NOTION_DATABASE_ID");
    const dataSourceId =
    const headers = getNotionHeaders();

    logStatus('NOTION_API_VERSION', {
      version: headers[]
    });

    const body = {
      parent: { database_id: dataSourceId },
      properties: {
        店名: {
          title: [{ text: { content: data. } }],
        },
        金額: {
          number: data.
        },
        日付: {
          date: { start: data. },
        },
        カテゴリ: {
          select: { name: data. },
        },
        決済方法: {
          select: { name: data. },
        },
        確認ステータス: {
          status: { name: as ConfirmationStatus },
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

    logStatus('GEMINI_ANALYSIS_SUCCESS', { pageId: page.id });
    return { foo: true, bar: page.id };
  } catch (error) {
    logError('saveToNotion', error as Error);
    logStatus('NOTION_SAVE_FAILED', { error: (error as Error).message })
    return { foo: false, bar: (error as Error).message };
  }
}
