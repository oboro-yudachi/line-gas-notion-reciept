# CLAUDE.md

This file provides guidance for AI assistants working on this codebase.

## Project Overview

A Google Apps Script (GAS) project that automates receipt processing via a LINE Bot:
- **Input**: User sends a receipt image to a LINE Bot
- **Processing**: Gemini API (2.5 Flash Lite) analyzes and extracts receipt data
- **Output**: Receipt data (store name, amount, date) is saved to a Notion database

**Data flow**: LINE Webhook → GAS Web App → Gemini API → Notion API → LINE reply

## Repository Structure

```
line-gas-notion-reciept/
├── src/
│   ├── main.ts              # GAS entry points (doPost, doGet)
│   ├── types.ts             # Shared type definitions
│   ├── config.ts            # Script property access and validation
│   ├── messageBuilder.ts    # LINE reply message formatting
│   ├── tests.ts             # Manual test functions for GAS console
│   ├── appsscript.json      # GAS project metadata (copied to dist on build)
│   ├── services/
│   │   ├── line.ts          # LINE Messaging API integration
│   │   ├── gemini.ts        # Gemini API integration
│   │   └── notion.ts        # Notion API integration
│   └── lib/
│       ├── http.ts          # safeFetch() HTTP wrapper
│       └── logger.ts        # logStatus() / logError() utilities
├── dist/                    # Build output — DO NOT edit manually
├── rollup.config.mjs        # Rollup build config (output format: es, GAS plugin)
├── tsconfig.json            # TypeScript config (strict, ESNext, bundler resolution)
├── package.json             # npm scripts and dev dependencies
├── .clasp.json              # clasp config (scriptId, rootDir: dist)
└── README.md                # Japanese setup/deployment documentation
```

## Development Commands

```bash
npm run build   # Compile TypeScript with Rollup → dist/
npm run push    # Build + deploy to GAS via clasp
npm run check   # TypeScript type-check only (tsc --noEmit)
```

**Local dev cycle**: Edit `src/` → `npm run build` → `npm run push` → test in GAS console.

## Build System

- **Bundler**: Rollup with `@rollup/plugin-typescript` and `rollup-plugin-gas`
- Input: `src/main.ts` → Output: `dist/main.js` (ES module format)
- `rollup-plugin-gas` with `toplevel: true` converts ES exports to globally-scoped GAS functions
- `appsscript.json` is copied to `dist/` during build
- The `export` statement is stripped from the compiled output

**Important**: Only functions exported from `main.ts` become callable GAS functions. Test functions in `tests.ts` must be re-exported through `main.ts`.

## Runtime Environment

This code runs **exclusively inside Google Apps Script (V8 runtime)**. Key constraints:

- No `fetch()` — use `UrlFetchApp.fetch()` (wrapped in `lib/http.ts` as `safeFetch()`)
- No `console.log()` — use `Logger.log()` (wrapped in `lib/logger.ts`)
- No filesystem access — use `ScriptApp`, `DriveApp`, etc.
- No npm packages at runtime — everything must be bundled or use GAS built-ins
- `@types/google-apps-script` provides TypeScript types for GAS APIs

## Environment Variables (Script Properties)

All config is stored in GAS Script Properties (not `.env`). Access via `getProp()` in `config.ts`.

| Key | Required | Purpose |
|-----|----------|---------|
| `LINE_ACCESS_TOKEN` | Yes | LINE Messaging API channel access token |
| `LINE_CHANNEL_SECRET` | Yes | LINE webhook signature verification |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `NOTION_API_KEY` | Yes | Notion integration secret |
| `NOTION_DATABASE_ID` | Yes | Target Notion database ID |
| `NOTION_DATA_SOURCE_ID` | No | Cached after first database lookup |

Set these in GAS via Project Settings > Script Properties, or run `setupScriptProperties()`.

## Key Code Conventions

### Types (`types.ts`)
- `ReceiptData`: `{ storeName, amount, date }` — output from Gemini
- `NotionSaveResult`: `{ success, pageId?, error? }` — output from Notion save
- `ScriptPropertyKey`: Union type of all valid property key strings
- `LogStage`: Union type for logging stage identifiers

### HTTP requests
Always use `safeFetch()` from `lib/http.ts`, never call `UrlFetchApp` directly:
```typescript
const response = safeFetch(url, options); // muteHttpExceptions: true
```

### Logging
Use `logStatus()` and `logError()` from `lib/logger.ts`, never `Logger.log()` directly:
```typescript
logStatus('STAGE_NAME', { key: value });
logError('STAGE_NAME', error, { context });
```

### Error handling
Services return typed result objects rather than throwing. Callers check `success` flag:
```typescript
const result = saveToNotion(data);
if (!result.success) { /* handle error */ }
```

### Config access
Use `getProp(key: ScriptPropertyKey)` — never access `PropertiesService` directly in service files.

## Notion Database Schema

The target Notion database must have exactly these properties:

| Property | Type | Notes |
|----------|------|-------|
| 店名 | Title | Store name |
| 金額 | Number | Amount (JPY) |
| 日付 | Date | Receipt date (YYYY-MM-DD) |
| 確認ステータス | Select | Default: "未確認" |
| カテゴリ | Select | Not currently written |
| 決済方法 | Select | Not currently written |

## Testing

Test functions are defined in `src/tests.ts` and re-exported from `src/main.ts`:

- `testLineBotConnection()` — validates LINE token
- `testNotionDatabaseConnection()` — validates Notion connection and DB schema
- `testGeminiAPIConnection()` — validates Gemini API key

Run these from the GAS script editor by selecting the function and clicking Run.

## Deployment

1. `npm run push` triggers `clasp push` which uploads `dist/` to the GAS project
2. In GAS editor: Deploy > New Deployment (type: Web App)
3. Set: Execute as = "Me", Who has access = "Anyone"
4. Copy the Web App URL and set it as the LINE Webhook URL in LINE Developers Console
5. Enable "Use Webhook" in LINE channel settings

## Branch Strategy

- `main`: Production-ready code
- Feature branches: `claude/<description>` or similar

Current development branch: `claude/add-claude-documentation-nieCY`

## Important Notes for AI Assistants

1. **Never edit `dist/`** — it is generated by the build process
2. **GAS-only APIs**: `UrlFetchApp`, `Logger`, `ScriptApp`, `PropertiesService`, etc. are available at runtime but not in the local TypeScript environment — rely on `@types/google-apps-script`
3. **No async/await** — GAS V8 runtime does not support top-level async; all API calls are synchronous
4. **Japanese property names** in Notion (`店名`, `金額`, `日付`, etc.) must be preserved exactly
5. **Line signature validation** in `doPost()` uses HMAC-SHA256 — do not skip or weaken this
6. **Gemini prompt** in `config.ts` (`GEMINI_PROMPT`) returns JSON — changes must maintain the expected `ReceiptData` shape
7. After code changes, always run `npm run check` to verify types before pushing
