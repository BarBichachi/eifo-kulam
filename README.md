# איפה כולם (Eifo Kulam)

Weekly team attendance for phones: who is in the office, who is on vacation, in the field or on reserve duty.
Each person logs in with their phone number, fills in their own days (quick picks or free text), and sees
everyone else read-only. A push notification every Wednesday at 07:30 reminds the team to fill next week.

- Phone app (PWA): https://barbichachi.github.io/eifo-kulam/
- Office PC copy: the Apps Script web app URL (`API_URL` in `.env` / repo variable), opened in a browser.
- UI: Hebrew, RTL, mobile first (320px and up), light/dark, installable to the home screen (PWA).

## Features

| Screen | What it does |
| --- | --- |
| היום | Who is where today, grouped: in the office / working elsewhere / not working, with notes and holiday banner. Day by day navigation. |
| שבוע | Everyone x Sun-Thu grid with real dates, office headcount per day, holidays. Any past or future week. Tap a cell for details. |
| השבוע שלי | Your week (next week by default): one-tap "all week as usual", copy last week, date range (e.g. 3 weeks of vacation), per-day status + note. Saves automatically. |
| עוד | Who has not filled next week yet, WhatsApp share (reminder text / week summary), notifications on/off + test, install guide, logout. |
| ניהול (admins) | Team members (name, phone, regular/student, admin, active, order), statuses (emoji, label, color, category, note required, active, order), notification coverage. |

On every launch of the phone app, if notifications are off for that device, a sheet asks to turn them on (iPhone
in a browser tab gets the home-screen install steps instead). If they are on, the device is silently re-registered.

Day model: an optional **status** plus an optional **note**. A note without a status is saved as **אחר**, which
requires a note. Untouched days show the member type default, faded: regular = **במשרד**, student = **לא מגיע**.
Day-off holidays (from Hebcal, Israel schedule) show **חג** unless the person filled something. Retired statuses
disappear from pickers but old days keep rendering them.

## Architecture

```
Phone (PWA on github.io) --POST text/plain JSON--> Apps Script web app --> Google Sheet (one tab per table)
Office PC browser --GET--> same Apps Script web app (serves the office copy) --google.script.run--> same backend
GitHub Actions (Wed cron) --service token--> Apps Script (subscriptions) --Web Push (VAPID)--> phones
```

| Part | Where | Notes |
| --- | --- | --- |
| Web app | `web/` | Preact + TypeScript + Vite. Hash routes, optimistic autosave (batched), offline cache of viewed weeks, service worker (`web/public/sw.js`) for app shell + push. |
| Office copy | `vite --mode office`, `scripts/lib/inline-html.ts` | The same app built into one self-contained `Index.html` that Apps Script serves on GET. Talks to the backend through `google.script.run.api()` (same origin). No service worker, push or install; its "עוד" screen links to the phone app. |
| Backend | `backend/` | Apps Script (V8), bundled by esbuild into one `Code.js` (`npm run build:gas`, which also builds `Index.html`), deployed with clasp. Bound to the Google Sheet. |
| Shared rules | `shared/` | Dates, phone normalization, default/holiday resolution, validation, headcount, not-filled, share texts, reminder timing. Used by backend, web and scripts. |
| Reminder | `scripts/reminder.ts`, `.github/workflows/reminder.yml` | Sends Web Push with `web-push` from GitHub Actions (Apps Script cannot do the required EC crypto). |
| Mock backend | `web/src/mock/` | The real router over in-memory tables in the browser (`VITE_API_URL=mock`), fake people only. Local development and screenshots. |

Why this stack: the office proxy blocks uncategorized hosts (`*.workers.dev`, `*.vercel.app`, ...). Apps Script +
Sheets is free, needs no server, and the Sheet doubles as backup, export and emergency admin view.

Why two front doors: on office PCs, `barbichachi.github.io` is opened through Symantec Web Isolation (fire.glass):
the page runs in a remote isolation browser whose calls to the API fail ("אין חיבור לשרת"). `script.google.com`
is not isolated, so the office copy served by Apps Script works there. Phones use the github.io PWA, which is the
only one that can install to the home screen and receive push notifications.

### Sheet tabs

| Tab | Columns |
| --- | --- |
| `members` | id, name, phone, type (regular/student), isAdmin, active, order |
| `statuses` | id, label, emoji, color, category (office/elsewhere/off), requiresNote, active, order |
| `entries` | date, memberId, statusId, note, updatedAt, updatedBy (empty statusId = reset to default) |
| `sessions` | tokenHash, memberId, createdAt, lastSeenAt |
| `push` | memberId, endpoint, p256dh, auth, createdAt, lastResult, lastResultAt |
| `holidays` | date, name, isDayOff, source (imported lazily per year from Hebcal; edit `isDayOff` freely) |
| `log` | timestamp, actorId, memberId, date, before, after (every change) |
| `settings` | key, value (holiday years loaded, last reminder week) |

All cells are plain text (keeps leading zeros and ISO dates). Tabs and columns are created by `setup()` and
upgraded automatically when `SCHEMA_VERSION` changes. Columns are matched by header name; extra columns you add
by hand are preserved.

### Security and privacy

- Names and phone numbers live **only** in the Google Sheet. The repository is public and contains no personal
  data (`*.xlsx`, `*.csv`, `roster*.json`, `.env*` are gitignored). Non-admin API responses never include phones.
- Login is by phone number only (no SMS code), as agreed: anyone who knows a colleague's number can log in as
  them. Failed logins are throttled (60 per hour globally). Sessions are random 256-bit tokens, stored hashed,
  kept on the device until "התנתקות"; admins can revoke all sessions of a member.
- Members can edit only themselves (including past days); admins can edit anyone. Every change is in the `log` tab.
- Service calls (GitHub Actions, local scripts) use `SERVICE_TOKEN`, stored in Script Properties and GitHub secrets.

## One-time setup

Requirements: Node 24+, a Google account (personal Gmail recommended: Workspace domains may forbid "Anyone"
web apps), GitHub CLI logged in as `BarBichachi`.

1. `npm install`
2. Google: enable the Apps Script API at https://script.google.com/home/usersettings, then `npm run clasp -- login`.
3. Create the Sheet + bound script: `npm run clasp -- create-script --type sheets --title "איפה כולם" --rootDir build/gas`
   (writes `.clasp.json`, gitignored).
4. `npm run gas:push`, then open the script (`npm run clasp -- open-script`), run **setup** once and accept the
   permissions. This creates the tabs and seeds the statuses.
5. `npm run gas:deploy`: creates the web app deployment and writes `GAS_DEPLOYMENT_ID` and `API_URL` to `.env`.
   The same `API_URL` is the office PC address (opening it in a browser shows the office copy).
6. `npm run configure`: generates `SERVICE_TOKEN` and VAPID keys in `.env` and stores them in Script Properties.
7. Team: fill the phones in `roster.local.json` (gitignored; format in `scripts/roster-import.ts`) and run
   `npm run roster`. Rows without a phone are skipped; re-running updates people by phone.
8. GitHub (repo `BarBichachi/eifo-kulam`):
   - Variables: `API_URL` (from `.env`), `APP_URL` = `https://barbichachi.github.io/eifo-kulam/`
   - Secrets: `SERVICE_TOKEN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (from `.env`)
   - Pages: source "GitHub Actions". Pushing to `main` deploys the site.
9. Optional, for the in-app "שליחת התראת בדיקה" button: create a fine-grained token limited to this repository
   with "Actions: Read and write", put it in `.env` as `GITHUB_DISPATCH_TOKEN` and run `npm run configure` again.
   Without it, the button shows a local notification only.

## Day to day

| Task | How |
| --- | --- |
| Add / remove a team member | Admin screen (צוות). Deactivate instead of deleting to keep history. |
| New status option | Admin screen (סטטוסים). Category decides the office headcount. |
| A holiday is (not) a day off | Edit `isDayOff` in the `holidays` tab. |
| Change backend or office copy | `npm run gas:deploy` (rebuilds `Code.js` + `Index.html`, same URL, Sheet data untouched). |
| Change site code | Commit and push to `main`, and run `npm run gas:deploy` so the office copy matches. |
| Test a push to one person | Actions > Weekly reminder > Run workflow > memberId (from the `members` tab). |
| Send the weekly reminder now | Actions > Weekly reminder > Run workflow > force. |

### Weekly reminder timing

Two crons (`04:05` and `05:05` UTC on Wednesday) cover Israel winter and summer time. Each run computes Israel
time: before 07:00 it exits (the wrong-offset run), between 07:00 and 07:30 it waits, between 07:30 and 12:00 it
sends. `svcReminderClaim` in the Sheet makes the send exactly-once per week; if nothing could be delivered the
claim is released so the second run retries. Subscriptions that the browser revoked (HTTP 404/410) are removed.
The workflow re-enables itself on every scheduled run so GitHub's 60-day inactivity rule never disables it.
GitHub may start scheduled runs late under load; the 07:05 start leaves 25 minutes of buffer.

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Site on http://127.0.0.1:5173/eifo-kulam/ (put `VITE_API_URL=mock` in `.env.local` for the fake backend). |
| `npm test` | Vitest: shared rules, backend handlers (in-memory tables), store and editor logic, reminder pipeline. |
| `npm run check` / `npm run lint` | TypeScript (web, backend, node) and ESLint. |
| `npm run build` | Production build to `dist/`. |
| `npm run build:gas` | Builds `build/gas/`: backend `Code.js`, the office copy `Index.html`, and the manifest. |
| `npm run clasp -- <args>` | Runs clasp without a shell (arguments with spaces stay intact on Windows) and trusts the OS certificate store, needed behind TLS-inspecting proxies. |
| `npm run icons` | Re-renders PNG icons from `web/src/assets/icon.svg` (the single source; also copied to `web/public/icons/`). |

## Phones: install and notifications

- **iPhone**: notifications work only from the home-screen app (iOS 16.4+). Open the link in Safari (not inside
  WhatsApp), Share, "הוספה למסך הבית", open from the icon, then עוד > הפעלת התראות.
- **Android**: Chrome, menu, "התקנת אפליקציה" (or the install button in עוד), then הפעלת התראות.
- The Hebrew onboarding message for the WhatsApp group is in [`docs/onboarding-he.md`](docs/onboarding-he.md).

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| "אין חיבור לשרת" on an office PC with the github.io link | Office PCs open github.io through web isolation, which breaks the API call. Use the office copy (the `API_URL` address) on PCs; phones keep the github.io app. |
| "התקבלה תשובה לא צפויה מהשרת" | Something other than the API answered (network filter or Google error page); check the browser console for the URL and the first lines of the response. |
| `clasp` / `gh` fail with "unable to get local issuer certificate" | TLS inspection on the office network: use `npm run clasp -- ...` (sets `NODE_USE_SYSTEM_CA=1`), or set that variable for other Node tools. |
| API returns HTML instead of JSON | Web app access is not "Anyone", or the script needs re-authorization: open the editor and run `setup`. Note: `clasp create-script` overwrites `build/gas/appsscript.json`; always push with `npm run gas:push`, which rebuilds it. |
| No notification on iPhone | Not opened from the home-screen icon, or notifications denied in iOS Settings > Notifications. |
| Reminder did not arrive | Check the Weekly reminder run in Actions, and the coverage list in ניהול > התראות. |
| Someone shows a wrong holiday | Edit the `holidays` tab (`isDayOff`), the app picks it up on the next load. |
