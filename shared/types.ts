// Core domain types shared by the Apps Script backend, the web app and Node scripts.

export type MemberType = 'regular' | 'student';

/** Drives headcount and grouping: in the office, working elsewhere, or not working. */
export type Category = 'office' | 'elsewhere' | 'off';

export interface Member {
  id: string;
  name: string;
  type: MemberType;
  isAdmin: boolean;
  active: boolean;
  order: number;
  /** Only present for the member themselves and in admin responses. */
  phone?: string;
}

export interface Status {
  id: string;
  label: string;
  emoji: string;
  /** Palette token name (see shared/statuses.ts PALETTE), mapped to a CSS variable. */
  color: string;
  category: Category;
  requiresNote: boolean;
  active: boolean;
  order: number;
}

/** One person-day. An entry with an empty statusId is a cleared day (back to the default). */
export interface Entry {
  date: string;
  memberId: string;
  statusId: string;
  note: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Holiday {
  date: string;
  name: string;
  isDayOff: boolean;
}

/** A requested change for one day. statusId null + empty note resets the day to its default. */
export interface DayInput {
  date: string;
  statusId: string | null;
  note: string;
}

export type DaySource = 'entry' | 'default' | 'holiday';

/** What a person-day resolves to after defaults and holidays are applied. */
export interface EffectiveDay {
  statusId: string;
  note: string;
  source: DaySource;
}
