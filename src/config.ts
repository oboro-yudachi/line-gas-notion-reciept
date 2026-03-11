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
