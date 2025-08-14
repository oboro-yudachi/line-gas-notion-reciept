// レシート解析＆Notion連携システム - Google Apps Scriptコード

// LINEからのWebhookを受け取るためのエンドポイント
function doPost(e) {
  try {
    // すべてのリクエスト情報を詳細に記録 (デバッグ用のメール送信をコメントアウト)
    const requestInfo = {
      contentLength: e.postData ? e.postData.contents.length : 0,
      contentType: e.contentType || 'none',
      method: e.method || 'none',
      parameters: e.parameters ? JSON.(e.parameters) : 'none',
      hasHeaders: !!e.headers,
      headerNames: e.headers ? Object.keys(e.headers) : []
    };
    
    // デバッグ情報をメールで送信 (コメントアウト)
    /*
    MailApp.sendEmail(
      "ここにご自身のメールアドレス", 
      "[LINE Bot] Webhook Debug Info", 
      `LINE Webhookからのリクエスト情報：\n${JSON.stringify(requestInfo, null, 2)}\n\n` +
      `ヘッダー詳細：\n${e.headers ? JSON.stringify(e.headers, null, 2) : '無し'}\n\n` +
      `ペイロード(最初の100文字)：\n${e.postData ? e.postData.contents.substring(0, 100) : '無し'}`
    );
    */
    
    // 通常の処理を続行：シグネチャヘッダーを検索（小文字も大文字も試す）
    let signature = null;
    
    // ヘッダーが存在する場合、すべてのキーをチェック
    if (e.headers) {
      const headerKeys = Object.keys(e.headers);
      for (const key of headerKeys) {
        // line-signatureやx-line-signatureを含むヘッダーを探す
        if (key.toLowerCase().includes('line-signature')) {
          signature = e.headers[key];
          break;
        }
      }
    }
    
    if (!signature) {
      // 署名が見つからない場合でも、とりあえずペイロードを処理
      try {
        if (e.postData && e.postData.contents) {
          const data = JSON.parse(e.postData.contents);
          
          // イベントがあれば処理
          if (data.events && data.events.length > 0) {
            data.events.forEach(event => {
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
      
      // 署名がなくても成功を返す
      return ContentService.createTextOutput(JSON.stringify({
        'status': 'success',
        'message': 'Processed without signature validation'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 署名がある場合は通常の検証を行う
    const payload = e.postData.contents;
    if (!validateSignature(payload, signature)) {
      return ContentService.createTextOutput(JSON.stringify({
        'status': 'error',
        'message': 'Invalid signature'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 署名が検証できた場合の通常処理
    const data = JSON.parse(payload);
    if (data.events && data.events.length > 0) {
      data.events.forEach(event => {
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
      'message': error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// LINEの署名を検証する関数
function validateSignature(payload, signature) {
  try {
    const channelSecret = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_SECRET');
    
    if (!channelSecret) {
      logError('validateSignature', 'Channel secret is not set in script properties');
      return false;
    }
    
    // HMAC-SHA256を計算し、16進数に変換
    const hash = Utilities.computeHmacSha256Signature(payload, channelSecret)
                         .map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
    
    // デバッグ情報（コメントアウト）
    /*
    logStatus('SIGNATURE_CHECK', 'system', { 
      calculatedHashLength: hash.length,
      receivedSignatureLength: signature.length,
      match: hash === signature
    });
    */
    
    return hash === signature;
  } catch (error) {
    logError('validateSignature', error);
    return false;
  }
}

// LINE Botの設定をテストする関数
function testLineBotConnection() {
  try {
    // LINEのチャネルアクセストークンが設定されているか確認
    const accessToken = PropertiesService.getScriptProperties().getProperty('LINE_ACCESS_TOKEN');
    if (!accessToken) {
      return "エラー: LINE_ACCESS_TOKENがスクリプトプロパティに設定されていません。";
    }
    
    // LINEのチャネルシークレットが設定されているか確認
    const channelSecret = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_SECRET');
    if (!channelSecret) {
      return "エラー: LINE_CHANNEL_SECRETがスクリプトプロパティに設定されていません。";
    }
    
    // LINE Bot情報を取得して接続テスト
    const url = 'https://api.line.me/v2/bot/info';
    const options = {
      'method': 'get',
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
      
      return `LINE Botへの接続テスト成功!\n\nBot名: ${botInfo.displayName}\nBot ID: ${botInfo.userId}\n\n以下の手順で確認してください:\n1. LINE Developer ConsoleでWebhook URLが正しく設定されているか確認\n2. Webhook利用がオンになっているか確認\n3. WebhookのSSL証明書検証が必要に応じて無効化されているか確認`;
    } else {
      logError('testLineBotConnection', `Failed with status code: ${responseCode}, Response: ${responseBody}`);
      return `LINE Botへの接続テスト失敗! ステータスコード: ${responseCode}\nレスポンス: ${responseBody}`;
    }
  } catch (error) {
    logError('testLineBotConnection', error);
    return "エラー: " + error.toString();
  }
}

// デプロイのWebhook URLを取得する
function getWebhookUrl() {
  return ScriptApp.getService().getUrl();
}

// LINEイベントを処理する関数
function handleEvent(event) {
  try {
    // 処理開始ログ
    const userId = event.source ? event.source.userId : 'unknown';
    logStatus('PROCESSING_STARTED', userId, { eventType: event.type, messageType: event.message ? event.message.type : 'none' });
    
    // メッセージイベント以外は処理しない
    if (event.type !== 'message') {
      logStatus('INVALID_EVENT_TYPE', userId, { eventType: event.type });
      return;
    }
    
    // テキストメッセージの場合「テストOK」と返す
    if (event.message.type === 'text') {
      replyToUser(event.replyToken, 'テストOK');
      logStatus('TEXT_MESSAGE_PROCESSED', userId, { text: event.message.text });
      return;
    }
    
    // 画像でない場合のメッセージ
    if (event.message.type !== 'image') {
      replyToUser(event.replyToken, 'レシートの写真を送信してください。');
      logStatus('NON_IMAGE_MESSAGE', userId, { messageType: event.message.type });
      return;
    }
    
    // 画像メッセージを処理
    const messageId = event.message.id;
    const replyToken = event.replyToken;
    
    // 処理中メッセージを送信
    replyToUser(replyToken, 'レシートを解析しています...');
    logStatus('RECEIPT_ANALYSIS_STARTED', userId, { messageId: messageId });
    
    // 画像を取得
    const imageData = getImageFromLine(messageId);
    if (!imageData) {
      notifyUser(userId, '画像の取得に失敗しました。もう一度試してください。');
      logStatus('IMAGE_FETCH_FAILED', userId, { messageId: messageId });
      return;
    }
    
    logStatus('IMAGE_FETCH_SUCCESS', userId, { messageId: messageId, size: imageData.length });
    
    // 画像をBase64エンコード
    const base64Image = Utilities.base64Encode(imageData);
    
    // Geminiで画像を解析
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
    
    // Notionにデータを保存
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
    
    // 処理結果をユーザーに通知
    const message = createResultMessage(analysisResult, notionResult);
    notifyUser(userId, message);
    
    // 処理完了ログ
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
    logStatus('PROCESS_ERROR', userId, { error: error.toString() });
    
    try {
      notifyUser(userId, 'エラーが発生しました。しばらく経ってから再度お試しください。');
    } catch (e) {
      // 通知失敗時のエラーはログのみ
      logError('notifyError', e);
    }
  }
}

// LINEから画像を取得する関数
function getImageFromLine(messageId) {
  const accessToken = PropertiesService.getScriptProperties().getProperty('LINE_ACCESS_TOKEN');
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  
  const options = {
    'method': 'get',
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

// Geminiでレシートを解析する関数
function analyzeReceiptWithGemini(base64Image) {
  const geminiApiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
  
  // 解析用のプロンプト
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
    'method': 'post',
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
    
    // レスポンスからJSONを抽出
    const textResponse = responseData.candidates[0].content.parts[0].text;
    
    // JSON部分を抽出して解析
    try {
      const jsonMatch = textResponse.match(/({[\s\S]*})/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      } else {
        // JSONの形式でない場合は最低限の情報を返す
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

// Notionにデータを保存する関数
function saveToNotion(data) {
  const notionApiKey = PropertiesService.getScriptProperties().getProperty('NOTION_API_KEY');
  const databaseId = PropertiesService.getScriptProperties().getProperty('NOTION_DATABASE_ID');
  const url = `https://api.notion.com/v1/pages`;
  
  // 日付をNotion形式に変換
  let notionDate = null;
  try {
    // YYYY-MM-DD-HH:MM形式から変換
    const dateParts = data.date.split('-');
    const year = dateParts[0];
    const month = dateParts[1];
    const day = dateParts[2];
    const time = dateParts[3] || "00:00";
    
    notionDate = `${year}-${month}-${day}T${time}:00.000+09:00`;
  } catch (e) {
    // 日付形式が不正な場合は現在日時を使用
    notionDate = new Date().toISOString();
  }
  
  // 金額を数値に変換（数値でない場合は0）
  const amount = Number(data.amount) || 0;
  
  const payload = {
    "parent": { "database_id": databaseId },
    "properties": {
      "店名": {
        "title": [
          {
            "text": {
              "content": data.storeName || "不明"
            }
          }
        ]
      },
      "金額": {
        "number": amount
      },
      "日付": {
        "date": {
          "start": notionDate
        }
      },
      "ジャンル": {
        "select": {
          "name": data.category || "その他"
        }
      },
      "決済方法": {
        "select": {
          "name": data.paymentMethod || "不明"
        }
      },
      "確認ステータス": {
        "select": {
          "name": "未確認"
        }
      }
    }
  };
  
  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'headers': {
      'Authorization': 'Bearer ' + notionApiKey,
      'Notion-Version': '2022-06-28'
    },
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      logError('saveToNotion', `Status code: ${responseCode}, Response: ${response.getContentText()}`);
      return { success: false, error: response.getContentText() };
    }
    
    const responseData = JSON.parse(response.getContentText());
    return { success: true, pageId: responseData.id };
  } catch (error) {
    logError('saveToNotion', error);
    return { success: false, error: error.toString() };
  }
}

// LINEにリプライする関数
function replyToUser(replyToken, message) {
  const accessToken = PropertiesService.getScriptProperties().getProperty('LINE_ACCESS_TOKEN');
  const url = 'https://api.line.me/v2/bot/message/reply';
  
  const payload = {
    'replyToken': replyToken,
    'messages': [{
      'type': 'text',
      'text': message
    }]
  };
  
  const options = {
    'method': 'post',
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

// LINEでユーザーに通知する関数（リプライトークンがない場合用）
function notifyUser(userId, message) {
  const accessToken = PropertiesService.getScriptProperties().getProperty('LINE_ACCESS_TOKEN');
  const url = 'https://api.line.me/v2/bot/message/push';
  
  const payload = {
    'to': userId,
    'messages': [{
      'type': 'text',
      'text': message
    }]
  };
  
  const options = {
    'method': 'post',
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

// 解析結果の通知メッセージを作成する関数
function createResultMessage(analysisResult, notionResult) {
  if (!notionResult.success) {
    return `レシートの解析は完了しましたが、Notionへの保存に失敗しました。\n\n【解析結果】\n店名: ${analysisResult.storeName}\n金額: ${analysisResult.amount}円\n日付: ${analysisResult.date.replace('-', '/')}\nジャンル: ${analysisResult.category}\n決済方法: ${analysisResult.paymentMethod}`;
  }
  
  return `レシートの解析が完了しました！\n\n【解析結果】\n店名: ${analysisResult.storeName}\n金額: ${analysisResult.amount}円\n日付: ${analysisResult.date.replace(/-/g, '/')}\nジャンル: ${analysisResult.category}\n決済方法: ${analysisResult.paymentMethod}\n\n内容に誤りがある場合は、Notionで直接編集してください。`;
}

// エラーをログに記録し、メールで通知する関数
function logError(functionName, error) {
  // エラーメッセージを作成
  const errorMessage = `[ERROR in ${functionName}] ${error.toString()}`;
  const timestamp = new Date().toISOString();
  
  // コンソールにエラーを出力
  console.error(errorMessage);
  
  // 重要なエラーのみメールで通知（必要に応じてコメント解除）
  /*
  try {
    const emailAddress = "ここにご自身のメールアドレス";
    const subject = `[レシート解析システム] エラー発生 (${timestamp})`;
    const body = `
レシート解析システムでエラーが発生しました。

発生時刻: ${timestamp}
発生箇所: ${functionName}
エラー内容: ${error.toString()}

このメールは自動送信されています。
    `;
    
    MailApp.sendEmail(emailAddress, subject, body);
  } catch (mailError) {
    console.error(`メール送信に失敗しました: ${mailError.toString()}`);
  }
  */
}

// 処理ステータスをログとメールで報告する関数
function logStatus(stage, userId, details) {
  const timestamp = new Date().toISOString();
  const statusMessage = `[STATUS] ${stage}: User=${userId}, Details=${JSON.stringify(details)}`;
  
  // コンソールに状態を出力
  console.log(statusMessage);
  
  // 重要なステータスのみメールで通知（コメントアウト）
  /*
  const importantStages = [
    'SYSTEM_STARTUP',
    'INVALID_SIGNATURE',
    'IMAGE_FETCH_FAILED',
    'GEMINI_ANALYSIS_FAILED',
    'NOTION_SAVE_FAILED',
    'PROCESS_ERROR',
    'PROCESS_COMPLETE'
  ];
  
  if (importantStages.includes(stage)) {
    try {
      const emailAddress = "haruharu.com.109607@gmail.com";
      
      // エラーや失敗の場合、件名に[重要]タグを追加
      let importancePrefix = "";
      if (stage.includes("ERROR") || stage.includes("FAILED")) {
        importancePrefix = "[重要] ";
      }
      
      const subject = `${importancePrefix}[レシート解析] ${stage} (${timestamp.slice(11, 19)})`;
      
      // 詳細情報の整形
      let bodyDetails = "";
      if (details) {
        try {
          bodyDetails = JSON.stringify(details, null, 2);
        } catch (e) {
          bodyDetails = String(details);
        }
      }
      
      const body = `
レシート解析システムからのステータス通知:

時刻: ${timestamp}
段階: ${stage}
ユーザーID: ${userId || 'N/A'}
詳細:
${bodyDetails}

このメールは自動送信されています。
      `;
      
      MailApp.sendEmail(emailAddress, subject, body);
    } catch (mailError) {
      console.error(`ステータスメール送信に失敗しました: ${mailError.toString()}`);
    }
  }
  */
}

// システム起動時に実行される関数
function doGet(e) {
  // システム起動ログを記録
  logStatus('SYSTEM_STARTUP', 'system', { 
    timestamp: new Date().toISOString(),
    deploymentId: ScriptApp.getScriptId(),
    version: '1.0'
  });
  
  return HtmlService.createHtmlOutput(`
    <h1>レシート解析＆Notion連携システム</h1>
    <p>このWebアプリケーションはLINE Bot用のバックエンドサービスです。</p>
    <p>LINEアプリからボットに接続して、レシートの写真を送信してください。</p>
    <p>システムステータス: アクティブ</p>
    <p>最終更新: ${new Date().toLocaleString()}</p>
  `);
}

// テスト用の関数（GASエディタから手動実行可能）
function testEmailNotification() {
  // エラー通知のテスト
  try {
    throw new Error("テスト用のエラー");
  } catch (e) {
    logError("testEmailNotification", e);
  }
  
  // 重要なステータス通知のテスト
  const stages = [
    "SYSTEM_STARTUP",
    "IMAGE_FETCH_FAILED",
    "GEMINI_ANALYSIS_FAILED",
    "NOTION_SAVE_FAILED",
    "PROCESS_COMPLETE",
    "PROCESS_ERROR"
  ];
  
  // テスト通知（メール通知はコメントアウトされているので実際にはメールは送信されない）
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    logStatus(stage, "test-user", {
      testId: i + 1,
      timestamp: new Date().toISOString(),
      message: `${stage}ステージのテスト通知`
    });
  }
  
  return 'ステータスログを記録しました。（メール通知はコメントアウトされています）';
}

// Notionデータベース接続をテストする関数
function testNotionDatabaseConnection() {
  try {
    const notionApiKey = PropertiesService.getScriptProperties().getProperty('NOTION_API_KEY');
    const databaseId = PropertiesService.getScriptProperties().getProperty('NOTION_DATABASE_ID');
    
    // API KeyとデータベースIDの存在確認
    if (!notionApiKey) {
      return "エラー: NOTION_API_KEYがスクリプトプロパティに設定されていません。";
    }
    if (!databaseId) {
      return "エラー: NOTION_DATABASE_IDがスクリプトプロパティに設定されていません。";
    }
    
    // データベースIDの形式を確認（ハイフンの有無）
    const formattedDatabaseId = formatDatabaseId(databaseId);
    
    // Notionデータベース情報を取得して接続テスト
    const url = `https://api.notion.com/v1/databases/${formattedDatabaseId}`;
    const options = {
      'method': 'get',
      'headers': {
        'Authorization': 'Bearer ' + notionApiKey,
        'Notion-Version': '2022-06-28'
      },
      'muteHttpExceptions': true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();
    
    if (responseCode === 200) {
      const dbInfo = JSON.parse(responseBody);
      
      // 現在のプロパティとAPIから取得した情報の比較を表示
      return `Notionデータベース接続成功!\n\nデータベース名: ${dbInfo.title[0]?.plain_text || "名称不明"}\n\n` + 
             `現在の設定:\n- データベースID: ${databaseId}\n- 整形済みID: ${formattedDatabaseId}\n\n` +
             `データベースプロパティ:\n${JSON.stringify(Object.keys(dbInfo.properties), null, 2)}\n\n` +
             `この情報を使って、saveToNotion関数のプロパティマッピングを確認してください。`;
    } else {
      const errorData = JSON.parse(responseBody);
      logError('testNotionDatabaseConnection', `Failed with status code: ${responseCode}, Response: ${responseBody}`);
      
      let errorMessage = `Notionデータベース接続失敗! ステータスコード: ${responseCode}\n` +
                         `エラー: ${errorData.message}\n\n`;
      
      // よくあるエラーの解決方法を提案
      if (errorData.code === "object_not_found") {
        errorMessage += "解決策:\n" +
                       "1. NotionのウェブUIでデータベースにアクセスし、正しいIDを確認\n" +
                       "2. インテグレーション設定で、このデータベースがあなたのインテグレーションと共有されていることを確認\n" +
                       "3. データベースIDの形式を確認（ハイフン付き/なし）\n";
      }
      
      return errorMessage;
    }
  } catch (error) {
    logError('testNotionDatabaseConnection', error);
    return "エラー: " + error.toString();
  }
}

// データベースIDの形式を整形する補助関数（ハイフン付き/なし両方に対応）
function formatDatabaseId(databaseId) {
  // すでにハイフンが含まれている場合はそのまま返す
  if (databaseId.includes('-')) {
    return databaseId;
  }
  
  // ハイフンなしの32桁の場合、ハイフン付きに変換
  if (databaseId.length === 32) {
    return databaseId.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  }
  
  // その他の形式はそのまま返す
  return databaseId;
}

// スクリプトプロパティを初期設定するための関数（初回セットアップ時に実行）
function setupScriptProperties() {
  const scriptProperties = PropertiesService.getScriptProperties();
  
  // 既存のプロパティを取得
  const existingProps = scriptProperties.getProperties();
  
  // デフォルト値のセット（プロパティが未設定の場合のみ設定）
  const defaultProps = {
    'LINE_CHANNEL_SECRET': 'YOUR_LINE_CHANNEL_SECRET',
    'LINE_ACCESS_TOKEN': 'YOUR_LINE_ACCESS_TOKEN',
    'GEMINI_API_KEY': 'YOUR_GEMINI_API_KEY',
    'NOTION_API_KEY': 'YOUR_NOTION_API_KEY',
    'NOTION_DATABASE_ID': 'YOUR_NOTION_DATABASE_ID'
  };
  
  // 未設定のプロパティのみセット
  for (const key in defaultProps) {
    if (!existingProps[key]) {
      scriptProperties.setProperty(key, defaultProps[key]);
    }
  }
  
  return 'スクリプトプロパティの初期設定が完了しました。実際のAPIキーなどを設定してください。';
}