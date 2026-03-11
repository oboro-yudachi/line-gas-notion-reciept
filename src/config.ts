// import { ScriptPropertyKey } from "./types";

function getProp(key: any) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function validateEnv() {
  const s = PropertiesService.getScriptProperties();
  const required = ['LINE_ACCESS_TOKEN','LINE_CHANNEL_SECRET','GEMINI_API_KEY','NOTION_API_KEY','NOTION_DATABASE_ID'];
  const missing = required.filter(k => !s.getProperty(k));
  if (missing.length) throw new Error('Missing properties: ' + missing.join(', '));
}
