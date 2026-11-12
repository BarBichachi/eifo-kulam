/** A sheet row as strings keyed by column name. */
export type Row = Record<string, string>;

/** Minimal row store; the Sheets and in-memory versions behave the same. Indexes are 0-based data rows. */
export interface Table {
  rows(): readonly Row[];
  append(rows: Row[]): void;
  update(index: number, row: Row): void;
  remove(indexes: number[]): void;
  /** Drops any cached read so the next rows() sees other writers' changes. */
  invalidate(): void;
}

/** In-memory Table used by tests. */
export class MemoryTable implements Table {
  data: Row[];

  constructor(initial: Row[] = []) {
    this.data = initial.map((r) => ({ ...r }));
  }

  rows(): readonly Row[] {
    return this.data;
  }

  append(rows: Row[]): void {
    this.data.push(...rows.map((r) => ({ ...r })));
  }

  update(index: number, row: Row): void {
    if (!this.data[index]) throw new Error(`No row ${index}`);
    this.data[index] = { ...row };
  }

  remove(indexes: number[]): void {
    for (const i of [...indexes].sort((a, b) => b - a)) this.data.splice(i, 1);
  }

  invalidate(): void {}
}

export const bool = (v: string | undefined): boolean => /^(true|1|yes|כן|v)$/i.test((v ?? '').trim());
export const boolStr = (v: boolean): string => (v ? 'TRUE' : 'FALSE');
