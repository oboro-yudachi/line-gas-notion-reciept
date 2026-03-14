
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

export function getNotionHeaders(useNew: any) {
  return {
    'Authorization': 'Bearer ' + getProp('NOTION_API_KEY'),
    'Content-Type': 'application/json',
    'Notion-Version': useNew ? '2025-09-03' : '2022-06-28'
  };
}

export function formatDatabaseId(databaseId: any) {
  if (databaseId.includes('-')) {
    return databaseId;
  }

  if (databaseId.length === 32) {
    return databaseId.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  }

  return databaseId;
}

export function resolveDataSourceId() {
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
