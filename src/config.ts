import { ScriptPropertyKey } from './types';

export function getProp(key: ScriptPropertyKey): string {
  return PropertiesService.getScriptProperties().getProperty(key) ?? '';
}

export function validateEnv(): void {
  const required: ScriptPropertyKey[] = [
    'LINE_ACCESS_TOKEN',
    'LINE_CHANNEL_SECRET',
    'GEMINI_API_KEY',
    'NOTION_API_KEY',
    'NOTION_DATABASE_ID',
  ];

  const missing = required.filter((key) => !getProp(key));

  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(', ')}`);
  }
}

export function setupScriptProperties(): string {
  const scriptProperties = PropertiesService.getScriptProperties();
  const existingProps = scriptProperties.getProperties();

  const defaultProps: Record<ScriptPropertyKey, string> = {
    LINE_CHANNEL_SECRET: 'YOUR_LINE_CHANNEL_SECRET',
    LINE_ACCESS_TOKEN: 'YOUR_LINE_ACCESS_TOKEN',
    GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY',
    NOTION_API_KEY: 'YOUR_NOTION_API_KEY',
    NOTION_DATABASE_ID: 'YOUR_NOTION_DATABASE_ID',
    NOTION_DATA_SOURCE_ID: '',
  };

  for (const key in defaultProps) {
    if (!existingProps[key]) {
      scriptProperties.setProperty(key, defaultProps[key as ScriptPropertyKey]);
    }
  }

  return 'スクリプトプロパティの初期設定が完了しました。';
}

export const GEMINI_PROMPT = `このレシート画像を解析して、以下のJSON形式で返してください。
JSON以外のテキストは含めないでください。
{
  "storeName": "店名",
  "amount": 数値,
  "date": "YYYY-MM-DD-HH:MM"
}`;
