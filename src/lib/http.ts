import { FetchResult } from "../types";
import { logError } from "./logger";

export function safeFetch(url: string, options?: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions): FetchResult {
  try {
    const resp = UrlFetchApp.fetch(url, {
      ...options,
     muteHttpExceptions: true
    })
    return {
      code: resp.getResponseCode(),
      text: resp.getContentText(),
      resp: resp,
    };
  } catch(error) {
    logError('safeFetch', error as Error)
    throw error;
  }
};
