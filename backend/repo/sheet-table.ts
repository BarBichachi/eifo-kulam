import type { Row, Table } from './table.ts';

const TZ = 'Asia/Jerusalem';

/** Sheets may turn typed values into Dates/numbers/booleans; everything is stored and read back as text. */
function cellToString(v: unknown): string {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v === null || v === undefined) return '';
  return String(v);
}

/** Table backed by one sheet tab. Row 1 is the header; columns are matched by header name. */
export class SheetTable implements Table {
  private readonly sheet: GoogleAppsScript.Spreadsheet.Sheet;
  private cache: { header: string[]; raw: string[][]; rows: Row[] } | null = null;

  constructor(sheet: GoogleAppsScript.Spreadsheet.Sheet) {
    this.sheet = sheet;
  }

  private load() {
    if (this.cache) return this.cache;
    const lastRow = this.sheet.getLastRow();
    const lastCol = Math.max(1, this.sheet.getLastColumn());
    const values = lastRow >= 1 ? this.sheet.getRange(1, 1, lastRow, lastCol).getValues() : [[]];
    const header = (values[0] ?? []).map((h) => cellToString(h).trim());
    const raw = values.slice(1).map((r) => r.map(cellToString));
    this.cache = { header, raw, rows: raw.map((r) => this.toRow(header, r)) };
    return this.cache;
  }

  private toRow(header: string[], raw: string[]): Row {
    const row: Row = {};
    header.forEach((h, i) => {
      if (h) row[h] = raw[i] ?? '';
    });
    return row;
  }

  /** Keeps unknown (manually added) columns intact when writing a row. */
  private toRaw(header: string[], row: Row, base: string[] = []): string[] {
    return header.map((h, i) => (h && h in row ? (row[h] ?? '') : (base[i] ?? '')));
  }

  rows(): readonly Row[] {
    return this.load().rows;
  }

  append(rows: Row[]): void {
    if (!rows.length) return;
    const c = this.load();
    const raws = rows.map((r) => this.toRaw(c.header, r));
    const start = c.raw.length + 2;
    const missingRows = start + raws.length - 1 - this.sheet.getMaxRows();
    if (missingRows > 0) this.sheet.insertRowsAfter(this.sheet.getMaxRows(), missingRows);
    this.sheet.getRange(start, 1, raws.length, c.header.length).setNumberFormat('@').setValues(raws);
    c.raw.push(...raws);
    c.rows.push(...raws.map((r) => this.toRow(c.header, r)));
  }

  update(index: number, row: Row): void {
    const c = this.load();
    const base = c.raw[index];
    if (!base) throw new Error(`No row ${index} in ${this.sheet.getName()}`);
    const raw = this.toRaw(c.header, row, base);
    this.sheet.getRange(index + 2, 1, 1, c.header.length).setNumberFormat('@').setValues([raw]);
    c.raw[index] = raw;
    c.rows[index] = this.toRow(c.header, raw);
  }

  remove(indexes: number[]): void {
    const c = this.load();
    for (const i of [...new Set(indexes)].sort((a, b) => b - a)) {
      if (!c.raw[i]) continue;
      this.sheet.deleteRow(i + 2);
      c.raw.splice(i, 1);
      c.rows.splice(i, 1);
    }
  }

  invalidate(): void {
    this.cache = null;
  }
}
