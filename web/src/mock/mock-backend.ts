// In-browser fake backend: the real router over in-memory tables, persisted to localStorage.
// Only loaded when VITE_API_URL=mock (local development, screenshots). Fake people only.
import { makeCtx } from '../../../backend/context.ts';
import type { Platform } from '../../../backend/platform.ts';
import { fromMember, fromStatus, Repo, type Tables } from '../../../backend/repo/repo.ts';
import { TABLE_NAMES, type TableName } from '../../../backend/repo/schema.ts';
import { MemoryTable, type Row } from '../../../backend/repo/table.ts';
import { handle } from '../../../backend/router.ts';
import { addDays, israelToday, weekStart, workDays } from '../../../shared/dates.ts';
import { SEED_STATUSES } from '../../../shared/statuses.ts';
import type { Member } from '../../../shared/types.ts';
import { readJson, writeJson } from '../data/storage.ts';

const DB_KEY = 'mock-db';
const LATENCY_MS = 250;

export const MOCK_MEMBERS: Member[] = [
  ['m1', 'דנה', '0500000001', 'regular', true],
  ['m2', 'יוסי', '0500000002', 'regular', false],
  ['m3', 'מיכל', '0500000003', 'regular', false],
  ['m4', 'אבי', '0500000004', 'regular', false],
  ['m5', 'רונית', '0500000005', 'regular', false],
  ['m6', 'עומר', '0500000006', 'regular', false],
  ['m7', 'שירה', '0500000007', 'regular', false],
  ['m8', 'נועה', '0500000008', 'student', false],
  ['m9', 'איתי', '0500000009', 'student', false],
  ['m10', 'ליאור', '0500000010', 'student', false],
].map(([id, name, phone, type, isAdmin], i) => ({
  id: id as string, name: name as string, phone: phone as string, type: type as Member['type'],
  isAdmin: isAdmin as boolean, active: true, order: i + 1,
}));

/** Some realistic data around today so every screen has something to show. */
function seed(): Record<TableName, Row[]> {
  const ws = weekStart(israelToday());
  const [s0, s1, s2, s3, s4] = workDays(ws);
  const [n0, n1, n2, n3, n4] = workDays(addDays(ws, 7));
  const e = (date: string | undefined, memberId: string, statusId: string, note = ''): Row => ({
    date: date!, memberId, statusId, note, updatedAt: new Date().toISOString(), updatedBy: memberId,
  });
  return {
    members: MOCK_MEMBERS.map(fromMember),
    statuses: SEED_STATUSES.map(fromStatus),
    entries: [
      e(s0, 'm2', 'vacation'), e(s1, 'm2', 'vacation'), e(s2, 'm2', 'vacation'),
      e(s1, 'm3', 'reserve'), e(s2, 'm3', 'reserve'), e(s3, 'm3', 'reserve'), e(s4, 'm3', 'reserve'),
      e(s0, 'm4', 'home'), e(s3, 'm4', 'field', 'אצל לקוח בחיפה'),
      e(s2, 'm5', 'other', 'קורס עזרה ראשונה'),
      e(s4, 'm6', 'sick'),
      e(s0, 'm8', 'office'), e(s1, 'm8', 'office'), e(s3, 'm8', 'half', 'עד 13:00'),
      e(s1, 'm9', 'office'), e(s2, 'm9', 'study', 'מבחן בסטטיסטיקה'),
      e(n0, 'm1', 'office'), e(n1, 'm1', 'office'), e(n2, 'm1', 'home'), e(n3, 'm1', 'office'), e(n4, 'm1', 'office'),
      e(n0, 'm2', 'office'), e(n2, 'm4', 'course', 'קורס ענן'), e(n1, 'm8', 'office'), e(n3, 'm8', 'office'),
    ],
    sessions: [],
    push: [],
    holidays: [
      { date: addDays(ws, 11), name: 'חג לדוגמה', isDayOff: 'TRUE', source: 'mock' },
      { date: addDays(ws, 10), name: 'ערב חג לדוגמה', isDayOff: 'FALSE', source: 'mock' },
    ],
    log: [],
    settings: [],
  };
}

// Mock-only hash (not cryptographic): stable 64-hex digest so the session logic runs unchanged
function fakeSha256(text: string): string {
  let out = '';
  for (let round = 0; round < 8; round++) {
    let h = 0x811c9dc5 ^ round;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    out += (h >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}

const cache = new Map<string, string>();
const props = new Map<string, string>();

const platform: Platform = {
  now: () => new Date(),
  uuid: () => crypto.randomUUID(),
  sha256Hex: fakeSha256,
  withLock: (fn) => fn(),
  cache: { get: (k) => cache.get(k) ?? null, put: (k, v) => void cache.set(k, v), remove: (k) => void cache.delete(k) },
  props: { get: (k) => props.get(k) ?? null, set: (k, v) => void props.set(k, v) },
  // No network in the mock: holidays come from the seed only
  fetch: () => ({ status: 200, body: '{"items":[]}' }),
  sleep: () => {},
  log: (m, d) => console.warn('[mock backend]', m, d),
};

function load(): Record<TableName, MemoryTable> {
  const saved = readJson<Record<TableName, Row[]>>(DB_KEY) ?? seed();
  return Object.fromEntries(TABLE_NAMES.map((n) => [n, new MemoryTable(saved[n] ?? [])])) as Record<TableName, MemoryTable>;
}

const tables = load();

function persist(): void {
  writeJson(DB_KEY, Object.fromEntries(TABLE_NAMES.map((n) => [n, tables[n].data])));
}

export async function mockTransport(body: string): Promise<unknown> {
  await new Promise((r) => setTimeout(r, LATENCY_MS));
  const res = handle(makeCtx(new Repo(tables as unknown as Tables), platform), body);
  persist();
  return JSON.parse(JSON.stringify(res));
}
