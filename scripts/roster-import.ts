// Imports the team into the Google Sheet. The roster file is gitignored and never leaves this machine
// except through the API call. Usage: npm run roster [-- path/to/roster.local.json]
//
// roster.local.json:
// [
//   { "name": "...", "phone": "05XXXXXXXX", "type": "regular", "isAdmin": true },
//   { "name": "...", "phone": "05XXXXXXXX", "type": "student" }
// ]
import { readFileSync } from 'node:fs';
import type { MemberInput } from '../shared/api.ts';
import { normalizePhone } from '../shared/phone.ts';
import { callApi, loadEnv, requireEnv } from './lib/env.ts';

loadEnv();
requireEnv('SERVICE_TOKEN');
const file = process.argv[2] ?? 'roster.local.json';
const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<MemberInput>[];
if (!Array.isArray(raw) || !raw.length) throw new Error(`${file} must be a non-empty JSON array`);

// Validate locally first so a typo never half-imports the roster; rows without a phone yet are skipped
const pending = raw.filter((m) => !String(m.phone ?? '').trim());
const members: MemberInput[] = raw.filter((m) => String(m.phone ?? '').trim()).map((m, i) => {
  const phone = normalizePhone(m.phone);
  if (!m.name?.trim() || !phone) throw new Error(`Row "${m.name ?? i + 1}": needs a name and a valid Israeli mobile phone`);
  if (m.type && m.type !== 'regular' && m.type !== 'student') throw new Error(`Row "${m.name}": type must be regular or student`);
  return { name: m.name.trim(), phone, type: m.type ?? 'regular', isAdmin: m.isAdmin === true, active: m.active !== false, order: raw.indexOf(m) + 1 };
});
if (pending.length) console.warn(`Skipped (no phone yet): ${pending.map((m) => m.name).join(', ')}`);
if (!members.length) throw new Error('No rows with a phone number to import');
const dupes = members.filter((m, i) => members.findIndex((x) => x.phone === m.phone) !== i);
if (dupes.length) throw new Error(`Duplicate phones: ${dupes.map((d) => d.name).join(', ')}`);

const result = await callApi('svcImportMembers', { members });
console.log(`Roster imported: ${result.created} created, ${result.updated} updated`);
