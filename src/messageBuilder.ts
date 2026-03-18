import { ReceiptData, NotionSaveResult } from "./types";

export function createResultMessage(
  data: ReceiptData,
  result: NotionSaveResult
): string {
  if (result.success) {
    return [
      'レシートを記録しました',
      '',
      `店名: ${data.storeName}`,
      `金額: ${data.amount}円`,
      `日付: ${data.date}`,
    ].join('\n')
  } else {
    return [
      '保存に失敗しました',
      '',
      `エラー: ${result.error}`
    ].join('\n')
  }
}
