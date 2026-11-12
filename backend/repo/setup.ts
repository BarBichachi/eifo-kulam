import { SEED_STATUSES } from '../../shared/statuses.ts';
import { fromStatus } from './repo.ts';
import { SCHEMA, SCHEMA_VERSION, TABLE_NAMES } from './schema.ts';
import { SheetTable } from './sheet-table.ts';
import type { Tables } from './repo.ts';
import { PROP } from '../platform.ts';

/** The bound spreadsheet (script created with `clasp create --type sheets`). */
export function spreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Script is not bound to a spreadsheet');
  return ss;
}

export function openTables(): Tables {
  const ss = spreadsheet();
  const tables = {} as Tables;
  for (const name of TABLE_NAMES) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) throw new Error(`Missing tab "${name}". Run setup().`);
    tables[name] = new SheetTable(sheet);
  }
  return tables;
}

/**
 * Creates missing tabs and header columns, formats everything as plain text (keeps leading zeros and
 * ISO dates intact) and seeds the default statuses once. Idempotent.
 */
export function ensureSchema(): void {
  const ss = spreadsheet();
  for (const name of TABLE_NAMES) {
    const sheet = ss.getSheetByName(name) ?? ss.insertSheet(name);
    const want = SCHEMA[name] as readonly string[];
    const lastCol = sheet.getLastColumn();
    const header = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0]!.map((h) => String(h).trim()) : [];
    const missing = want.filter((c) => !header.includes(c));
    if (missing.length) {
      sheet.getRange(1, header.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    }
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).setNumberFormat('@');
  }

  const statuses = new SheetTable(ss.getSheetByName('statuses')!);
  if (statuses.rows().length === 0) statuses.append(SEED_STATUSES.map(fromStatus));

  // Drop the empty default tab a new spreadsheet comes with
  for (const sheet of ss.getSheets()) {
    const isOurs = (TABLE_NAMES as string[]).includes(sheet.getName());
    if (!isOurs && sheet.getLastRow() === 0 && ss.getSheets().length > TABLE_NAMES.length) ss.deleteSheet(sheet);
  }
  PropertiesService.getScriptProperties().setProperty(PROP.SCHEMA_VERSION, SCHEMA_VERSION);
}

/** Cheap check run on every request so a redeploy with a new schema upgrades the Sheet by itself. */
export function ensureSchemaIfNeeded(): void {
  if (PropertiesService.getScriptProperties().getProperty(PROP.SCHEMA_VERSION) === SCHEMA_VERSION) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(20_000);
  try {
    if (PropertiesService.getScriptProperties().getProperty(PROP.SCHEMA_VERSION) !== SCHEMA_VERSION) ensureSchema();
  } finally {
    lock.releaseLock();
  }
}
