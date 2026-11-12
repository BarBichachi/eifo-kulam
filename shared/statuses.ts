import type { Category, MemberType, Status } from './types.ts';

/** Color tokens a status can use; each maps to --status-<name> in web/src/styles/tokens.css. */
export const PALETTE = [
  'blue', 'teal', 'green', 'lime', 'amber', 'orange', 'red', 'pink', 'purple', 'indigo', 'brown', 'gray',
] as const;

export const CATEGORIES: readonly Category[] = ['office', 'elsewhere', 'off'];

export const CATEGORY_LABELS: Record<Category, string> = {
  office: 'במשרד',
  elsewhere: 'עובדים מחוץ למשרד',
  off: 'לא עובדים',
};

export const OTHER_STATUS_ID = 'other';
export const HOLIDAY_STATUS_ID = 'holiday';

/** What an untouched day means for each member type. */
export const DEFAULT_STATUS: Record<MemberType, string> = {
  regular: 'office',
  student: 'not_coming',
};

export const MEMBER_TYPE_LABELS: Record<MemberType, string> = {
  regular: 'עובד/ת קבוע/ה',
  student: 'סטודנט/ית',
};

export const NOTE_MAX = 200;

/** Initial status list, written to the Sheet on first setup. Admins can edit/extend it later. */
export const SEED_STATUSES: Status[] = [
  { id: 'office', label: 'במשרד', emoji: '🏢', color: 'blue', category: 'office', requiresNote: false },
  { id: 'half', label: 'חצי יום במשרד', emoji: '🌗', color: 'indigo', category: 'office', requiresNote: false },
  { id: 'home', label: 'עבודה מהבית', emoji: '🏠', color: 'teal', category: 'elsewhere', requiresNote: false },
  { id: 'field', label: 'בשטח / אצל לקוח', emoji: '🚗', color: 'lime', category: 'elsewhere', requiresNote: false },
  { id: 'course', label: 'קורס / השתלמות', emoji: '🎓', color: 'purple', category: 'elsewhere', requiresNote: false },
  { id: 'event', label: 'כנס / אירוע', emoji: '🎤', color: 'pink', category: 'elsewhere', requiresNote: false },
  { id: 'vacation', label: 'חופש', emoji: '🌴', color: 'green', category: 'off', requiresNote: false },
  { id: 'reserve', label: 'מילואים', emoji: '🪖', color: 'brown', category: 'off', requiresNote: false },
  { id: 'sick', label: 'מחלה', emoji: '🤒', color: 'red', category: 'off', requiresNote: false },
  { id: 'study', label: 'לימודים / מבחן', emoji: '📚', color: 'amber', category: 'off', requiresNote: false },
  { id: 'not_coming', label: 'לא מגיע', emoji: '➖', color: 'gray', category: 'off', requiresNote: false },
  { id: OTHER_STATUS_ID, label: 'אחר', emoji: '✏️', color: 'orange', category: 'elsewhere', requiresNote: true },
].map((s, i) => ({ ...s, active: true, order: i + 1 }) as Status);

/** Pseudo status shown on day-off holidays for people who did not fill anything. */
export const HOLIDAY_STATUS: Status = {
  id: HOLIDAY_STATUS_ID,
  label: 'חג',
  emoji: '🎉',
  color: 'amber',
  category: 'off',
  requiresNote: false,
  active: false,
  order: 0,
};

/** Fallback for a statusId that no longer exists (e.g. deleted directly in the Sheet). */
export function unknownStatus(id: string): Status {
  return { id, label: id || 'לא ידוע', emoji: '❔', color: 'gray', category: 'elsewhere', requiresNote: false, active: false, order: 999 };
}
