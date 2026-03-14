// レシート解析＆Notion連携システム - Google Apps Script (Notion API 2025-09-03 完全対応版)

// ===== ユーティリティ関数 =====



// ===== メイン処理関数 =====



// ===== API連携関数 =====

// ===== Notion API関数（新版対応）=====


// ===== LINE API関数 =====

// ===== ヘルパー関数 =====


// ===== テスト関数 =====


export function getWebhookUrl() {
  return ScriptApp.getService().getUrl();
}

export function doGet(e: any) {
  logStatus('SYSTEM_STARTUP', 'system', { 
    timestamp: new Date().toISOString(),
    deploymentId: ScriptApp.getScriptId(),
    version: '2.0-notion-api-2025-complete'
  });
  
  return HtmlService.createHtmlOutput(`
    <h1>レシート解析＆Notion連携システム v2.0</h1>
    <p>NotionAPI 2025-09-03 完全対応版</p>
    <p>このWebアプリケーションはLINE Bot用のバックエンドサービスです。</p>
    <p>LINEアプリからボットに接続して、レシートの写真を送信してください。</p>
    <p>システムステータス: アクティブ</p>
    <p>最終更新: ${new Date().toLocaleString()}</p>
  `);
}

export function setupScriptProperties() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const existingProps = scriptProperties.getProperties();
  
  const defaultProps = {
    'LINE_CHANNEL_SECRET': 'YOUR_LINE_CHANNEL_SECRET',
    'LINE_ACCESS_TOKEN': 'YOUR_LINE_ACCESS_TOKEN',
    'GEMINI_API_KEY': 'YOUR_GEMINI_API_KEY',
    'NOTION_API_KEY': 'YOUR_NOTION_API_KEY',
    'NOTION_DATABASE_ID': 'YOUR_NOTION_DATABASE_ID'
  };
  
  for (const key in defaultProps) {
    if (!existingProps[key]) {
      scriptProperties.setProperty(key, (defaultProps as Record<string, string>)[key]);
    }
  }
  
  return 'スクリプトプロパティの初期設定が完了しました。実際のAPIキーなどを設定してください。';
}
