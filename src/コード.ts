// レシート解析＆Notion連携システム - Google Apps Script (Notion API 2025-09-03 完全対応版)

// ===== ユーティリティ関数 =====

function getProp(key: any) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function getNotionHeaders(useNew: any) {
  return {
    'Authorization': 'Bearer ' + getProp('NOTION_API_KEY'),
    'Content-Type': 'application/json',
    'Notion-Version': useNew ? '2025-09-03' : '2022-06-28'
  };
}

function validateEnv() {
  const s = PropertiesService.getScriptProperties();
  const required = ['LINE_ACCESS_TOKEN','LINE_CHANNEL_SECRET','GEMINI_API_KEY','NOTION_API_KEY','NOTION_DATABASE_ID'];
  const missing = required.filter(k => !s.getProperty(k));
  if (missing.length) throw new Error('Missing properties: ' + missing.join(', '));
}

function resolveDataSourceId() {
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty('NOTION_DATA_SOURCE_ID');
  if (cached) return cached;

  const dbId = formatDatabaseId(getProp('NOTION_DATABASE_ID'));
  const url = `https://api.notion.com/v1/databases/${dbId}/data_sources`;
  
  const resp = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: getNotionHeaders(true),
    muteHttpExceptions: true
  });
  
  if (resp.getResponseCode() !== 200) {
    throw new Error('DS discovery failed: ' + resp.getContentText());
  }
  
  const body = JSON.parse(resp.getContentText());
  const dsId = body?.results?.[0]?.id || body?.data?.[0]?.id;
  if (!dsId) throw new Error('No data_source found');
  
  props.setProperty('NOTION_DATA_SOURCE_ID', dsId);
  return dsId;
}

function safeFetch(url: any, options: any, ctx: any) {
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, ...options });
  const code = resp.getResponseCode();
  const text = resp.getContentText();
  if (code < 200 || code >= 300) {
    logError(ctx || 'safeFetch', `HTTP ${code}: ${text}`);
  }
  return { code, text, resp };
}

function formatDatabaseId(databaseId: any) {
  if (databaseId.includes('-')) {
    return databaseId;
  }
  
  if (databaseId.length === 32) {
    return databaseId.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  }
  
  return databaseId;
}

// ===== メイン処理関数 =====

function doPost(e: any) {
  try {
    const requestInfo = {
      contentLength: e.postData ? e.postData.contents.length : 0,
      contentType: e.contentType || 'none',
      method: e.method || 'none',
      parameters: e.parameters ? JSON.stringify(e.parameters) : 'none',
      hasHeaders: !!e.headers,
      headerNames: e.headers ? Object.keys(e.headers) : []
    };
    
    let signature = null;
    
    if (e.headers) {
      const headerKeys = Object.keys(e.headers);
      for (const key of headerKeys) {
        if (key.toLowerCase().includes('line-signature')) {
          signature = e.headers[key];
          break;
        }
      }
    }
    
    if (!signature) {
      try {
        if (e.postData && e.postData.contents) {
          const data = JSON.parse(e.postData.contents);
          
          if (data.events && data.events.length > 0) {
            data.events.forEach((event: any) => {
              try {
                handleEvent(event);
              } catch (eventError) {
                logError('handleEvent in doPost', eventError);
              }
            });
          }
        }
      } catch (parseError) {
        logError('doPost-parse', parseError);
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        'status': 'success',
        'message': 'Processed without signature validation'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const payload = e.postData.contents;
    if (!validateSignature(payload, signature)) {
      return ContentService.createTextOutput(JSON.stringify({
        'status': 'error',
        'message': 'Invalid signature'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const data = JSON.parse(payload);
    if (data.events && data.events.length > 0) {
      data.events.forEach((event: any) => {
        handleEvent(event);
      });
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      'status': 'success'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    logError('doPost', error);
    return ContentService.createTextOutput(JSON.stringify({
      'status': 'error',
      'message': String(error)
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function validateSignature(payload: any, signature: any) {
  try {
    const channelSecret = getProp('LINE_CHANNEL_SECRET');
    
    if (!channelSecret) {
      logError('validateSignature', 'Channel secret is not set in script properties');
      return false;
    }
    
    const hash = Utilities.computeHmacSha256Signature(payload, channelSecret)
                         .map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
    
    return hash === signature;
  } catch (error) {
    logError('validateSignature', error);
    return false;
  }
}

function handleEvent(event: any) {
  try {
    const userId = event.source ? event.source.userId : 'unknown';
    logStatus('PROCESSING_STARTED', userId, { eventType: event.type, messageType: event.message ? event.message.type : 'none' });
    
    if (event.type !== 'message') {
      logStatus('INVALID_EVENT_TYPE', userId, { eventType: event.type });
      return;
    }
    
    if (event.message.type === 'text') {
      replyToUser(event.replyToken, 'テストOK');
      logStatus('TEXT_MESSAGE_PROCESSED', userId, { text: event.message.text });
      return;
    }
    
    if (event.message.type !== 'image') {
      replyToUser(event.replyToken, 'レシートの写真を送信してください。');
      logStatus('NON_IMAGE_MESSAGE', userId, { messageType: event.message.type });
      return;
    }
    
    const messageId = event.message.id;
    const replyToken = event.replyToken;
    
    replyToUser(replyToken, 'レシートを解析しています...');
    logStatus('RECEIPT_ANALYSIS_STARTED', userId, { messageId: messageId });
    
    const imageData = getImageFromLine(messageId);
    if (!imageData) {
      notifyUser(userId, '画像の取得に失敗しました。もう一度試してください。');
      logStatus('IMAGE_FETCH_FAILED', userId, { messageId: messageId });
      return;
    }
    
    logStatus('IMAGE_FETCH_SUCCESS', userId, { messageId: messageId, size: imageData.length });
    
    const base64Image = Utilities.base64Encode(imageData);
    
    logStatus('GEMINI_ANALYSIS_STARTED', userId, { messageId: messageId });
    const analysisResult = analyzeReceiptWithGemini(base64Image);
    
    if (!analysisResult) {
      notifyUser(userId, 'レシートの解析に失敗しました。鮮明な写真で再度お試しください。');
      logStatus('GEMINI_ANALYSIS_FAILED', userId, { messageId: messageId });
      return;
    }
    
    logStatus('GEMINI_ANALYSIS_SUCCESS', userId, { 
      messageId: messageId, 
      storeName: analysisResult.storeName,
      amount: analysisResult.amount
    });
    
    logStatus('NOTION_SAVE_STARTED', userId, { messageId: messageId });
    const notionResult = saveToNotion(analysisResult);
    
    if (!notionResult.success) {
      logStatus('NOTION_SAVE_FAILED', userId, { 
        messageId: messageId, 
        error: notionResult.error 
      });
    } else {
      logStatus('NOTION_SAVE_SUCCESS', userId, { 
        messageId: messageId, 
        pageId: notionResult.pageId 
      });
    }
    
    const message = createResultMessage(analysisResult, notionResult);
    notifyUser(userId, message);
    
    logStatus('PROCESS_COMPLETE', userId, { 
      messageId: messageId,
      success: true,
      storeName: analysisResult.storeName,
      amount: analysisResult.amount,
      notionSaved: notionResult.success
    });
    
  } catch (error) {
    const userId = event.source ? event.source.userId : 'unknown';
    logError('handleEvent', error);
    logStatus('PROCESS_ERROR', userId, { error: String(error) });
    
    try {
      notifyUser(userId, 'エラーが発生しました。しばらく経ってから再度お試しください。');
    } catch (e) {
      logError('notifyError', e);
    }
  }
}

// ===== API連携関数 =====

function getImageFromLine(messageId: any) {
  const accessToken = getProp('LINE_ACCESS_TOKEN');
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  
  const options = {
    'method': 'get' as const,
    'headers': {
      'Authorization': 'Bearer ' + accessToken
    },
    'muteHttpExceptions': true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() === 200) {
    return response.getContent();
  } else {
    logError('getImageFromLine', `Status code: ${response.getResponseCode()}, Response: ${response.getContentText()}`);
    return null;
  }
}

function analyzeReceiptWithGemini(base64Image: any) {
  const geminiApiKey = getProp('GEMINI_API_KEY');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiApiKey}`;
  
  const prompt = `
    あなたはレシート解析AIです。この画像はレシートです。
    画像からレシート情報を抽出し、次の情報を含むJSONオブジェクトを返してください：
    
    1. 店名(storeName): レシートに記載された店舗名
    2. 金額(amount): 支払い総額（円）。数値のみ。
    3. 日付(date): 購入日時。YYYY-MM-DD-HH:MM形式で。時間が不明の場合は00:00としてください。
    4. ジャンル(category): 以下のカテゴリから最も適切なものを1つ選択：
       カフェ、ファストフード、レストラン、コンビニ、スーパー、美容、ファッション、交通費、病院、娯楽、書店、家電、フィットネス、その他
    5. 決済方法(paymentMethod): 以下から選択：
       現金、クレジット、QRコード、電子マネー、不明
    
    回答は必ずJSONフォーマットのみで、追加のテキストは含めないでください。
    例: {"storeName": "スターバックス", "amount": 550, "date": "2025-03-15-13:45", "category": "カフェ", "paymentMethod": "電子マネー"}
    
    読み取れない場合やあいまいな場合は、該当フィールドに "不明" と入力するか、最も可能性の高い値を入力してください。
  `;
  
  const payload = {
    "contents": [{
      "parts":[
        {"text": prompt},
        {"inline_data": {
          "mime_type": "image/jpeg",
          "data": base64Image
        }}
      ]
    }],
    "generation_config": {
      "temperature": 0.1,
      "top_p": 0.95,
      "max_output_tokens": 1024
    }
  };
  
  const options = {
    'method': 'post' as const,
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      logError('analyzeReceiptWithGemini', `Status code: ${responseCode}, Response: ${response.getContentText()}`);
      return null;
    }
    
    const responseData = JSON.parse(response.getContentText());
    const textResponse = responseData.candidates[0].content.parts[0].text;
    
    try {
      const jsonMatch = textResponse.match(/({[\s\S]*})/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      } else {
        logError('analyzeReceiptWithGemini', 'Failed to extract JSON: ' + textResponse);
        return {
          "storeName": "不明",
          "amount": 0,
          "date": new Date().toISOString().slice(0, 10) + "-00:00",
          "category": "その他",
          "paymentMethod": "不明"
        };
      }
    } catch (jsonError) {
      logError('analyzeReceiptWithGemini', 'JSON parse error: ' + jsonError + ', Text: ' + textResponse);
      return null;
    }
  } catch (error) {
    logError('analyzeReceiptWithGemini', error);
    return null;
  }
}

// ===== Notion API関数（新版対応）=====

function saveToNotion(data: any) {
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

// ===== LINE API関数 =====

function replyToUser(replyToken: any, message: any) {
  const accessToken = getProp('LINE_ACCESS_TOKEN');
  const url = 'https://api.line.me/v2/bot/message/reply';
  
  const payload = {
    'replyToken': replyToken,
    'messages': [{
      'type': 'text',
      'text': message
    }]
  };
  
  const options = {
    'method': 'post' as const,
    'contentType': 'application/json',
    'headers': {
      'Authorization': 'Bearer ' + accessToken
    },
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) {
      logError('replyToUser', `Status code: ${response.getResponseCode()}, Response: ${response.getContentText()}`);
    }
  } catch (error) {
    logError('replyToUser', error);
  }
}

function notifyUser(userId: any, message: any) {
  const accessToken = getProp('LINE_ACCESS_TOKEN');
  const url = 'https://api.line.me/v2/bot/message/push';
  
  const payload = {
    'to': userId,
    'messages': [{
      'type': 'text',
      'text': message
    }]
  };
  
  const options = {
    'method': 'post' as const,
    'contentType': 'application/json',
    'headers': {
      'Authorization': 'Bearer ' + accessToken
    },
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) {
      logError('notifyUser', `Status code: ${response.getResponseCode()}, Response: ${response.getContentText()}`);
    }
  } catch (error) {
    logError('notifyUser', error);
  }
}

// ===== ヘルパー関数 =====

function createResultMessage(analysisResult: any, notionResult: any) {
  if (!notionResult.success) {
    return `レシートの解析は完了しましたが、Notionへの保存に失敗しました。\n\n【解析結果】\n店名: ${analysisResult.storeName}\n金額: ${analysisResult.amount}円\n日付: ${analysisResult.date.replace(/-/g, '/')}\nジャンル: ${analysisResult.category}\n決済方法: ${analysisResult.paymentMethod}`;
  }
  
  return `レシートの解析が完了しました！\n\n【解析結果】\n店名: ${analysisResult.storeName}\n金額: ${analysisResult.amount}円\n日付: ${analysisResult.date.replace(/-/g, '/')}\nジャンル: ${analysisResult.category}\n決済方法: ${analysisResult.paymentMethod}\n\n内容に誤りがある場合は、Notionで直接編集してください。`;
}

// ===== ログ・エラー処理 =====

function logError(functionName: any, error: any) {
  const errorMessage = `[ERROR in ${functionName}] ${error.toString()}`;
  const timestamp = new Date().toISOString();
  console.error(errorMessage);
}

function logStatus(stage: any, userId: any, details: any) {
  const timestamp = new Date().toISOString();
  const statusMessage = `[STATUS] ${stage}: User=${userId}, Details=${JSON.stringify(details)}`;
  console.log(statusMessage);
}

// ===== テスト関数 =====

function testNotionDatabaseConnection() {
  try {
    validateEnv();
    
    const dbId = formatDatabaseId(getProp('NOTION_DATABASE_ID'));
    const oldHeaders = getNotionHeaders(false);
    const newHeaders = getNotionHeaders(true);

    // 1) 旧API DB情報
    let dbName = '(unknown)';
    let propList: any[] = [];
    let oldStatus = '';
    try {
      const r = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${dbId}`, {
        method: 'get', headers: oldHeaders, muteHttpExceptions: true
      });
      oldStatus = `${r.getResponseCode()}`;
      if (r.getResponseCode() === 200) {
        const body = JSON.parse(r.getContentText());
        dbName = (body.title?.[0]?.plain_text) || body.title || '(no title)';
        propList = Object.keys(body.properties || {});
      } else {
        oldStatus += ` - ${r.getContentText()}`;
      }
    } catch (e) {
      oldStatus = `error: ${String(e)}`;
    }

    // 2) data_source_id 取得
    let dsId = '', dsErr = '';
    try { 
      dsId = resolveDataSourceId(); 
    } catch (e) { 
      dsErr = String(e); 
    }

    // 3) 新APIで最小クエリ
    let newStatus = '', resultsLen = 0;
    if (dsId) {
      try {
        const rq = { page_size: 1 };
        const r2 = UrlFetchApp.fetch(`https://api.notion.com/v1/data_sources/${dsId}/query`, {
          method: 'post', headers: newHeaders, contentType: 'application/json',
          payload: JSON.stringify(rq), muteHttpExceptions: true
        });
        newStatus = `${r2.getResponseCode()}`;
        if (r2.getResponseCode() === 200) {
          const b2 = JSON.parse(r2.getContentText());
          resultsLen = (b2.results || []).length;
        } else {
          newStatus += ` - ${r2.getContentText()}`;
        }
      } catch (e) {
        newStatus = `error: ${String(e)}`;
      }
    }

    // 4) 結果を返す
    const result = [
      `=== Notion API接続テスト結果 ===`,
      `DB名: ${dbName}`,
      `プロパティ: ${propList.join(', ') || '(none)'}`,
      `data_source_id: ${dsId || '(取得失敗)'}`,
      ``,
      `旧API(/databases): ${oldStatus}`,
      `新API(/data_sources/query): ${newStatus}${resultsLen ? ` (results: ${resultsLen})` : ''}`,
      ``,
      `移行状況: ${dsId ? '✅ 新API利用可能' : '⚠️ フォールバックモード'}`,
      dsErr ? `エラー詳細: ${dsErr}` : ''
    ].filter(line => line !== '').join('\n');
    
    console.log(result);
    return result;
  } catch (error) {
    const result = `❌ テスト失敗: ${String(error)}`;
    console.error(result);
    return result;
  }
}

function testLineBotConnection() {
  try {
    validateEnv();
    
    const accessToken = getProp('LINE_ACCESS_TOKEN');
    const url = 'https://api.line.me/v2/bot/info';
    const options = {
      'method': 'get' as const,
      'headers': {
        'Authorization': 'Bearer ' + accessToken
      },
      'muteHttpExceptions': true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();
    
    if (responseCode === 200) {
      const botInfo = JSON.parse(responseBody);
      logStatus('LINE_BOT_CONNECTION_SUCCESS', 'system', { 
        botName: botInfo.displayName,
        userId: botInfo.userId
      });
      
      const result = `✅ LINE Bot接続テスト成功!\n\nBot名: ${botInfo.displayName}\nBot ID: ${botInfo.userId}\n\n以下の手順で確認してください:\n1. LINE Developer ConsoleでWebhook URLが正しく設定されているか確認\n2. Webhook利用がオンになっているか確認\n3. WebhookのSSL証明書検証が必要に応じて無効化されているか確認`;
      console.log(result);
      return result;
    } else {
      logError('testLineBotConnection', `Failed with status code: ${responseCode}, Response: ${responseBody}`);
      const result = `❌ LINE Bot接続テスト失敗! ステータスコード: ${responseCode}\nレスポンス: ${responseBody}`;
      console.error(result);
      return result;
    }
  } catch (error) {
    logError('testLineBotConnection', error);
    const result = `❌ エラー: ${String(error)}`;
    console.error(result);
    return result;
  }
}

function getWebhookUrl() {
  return ScriptApp.getService().getUrl();
}

function doGet(e: any) {
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

function setupScriptProperties() {
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
