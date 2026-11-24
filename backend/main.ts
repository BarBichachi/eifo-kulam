import { makeCtx } from './context.ts';
import { dispatchWeeklyReminder } from './handlers/push.ts';
import { gasPlatform } from './platform.gas.ts';
import { Repo } from './repo/repo.ts';
import { ensureSchema, ensureSchemaIfNeeded, openTables, spreadsheet } from './repo/setup.ts';
import { APP_VERSION, handle } from './router.ts';

const FATAL = { ok: false, error: { code: 'INTERNAL', message: 'השרת לא זמין כרגע. נסו שוב בעוד רגע.' } };

/** Runs one API request and returns the JSON response text. Never throws. */
function respond(body: string): string {
  try {
    ensureSchemaIfNeeded();
    return JSON.stringify(handle(makeCtx(new Repo(openTables()), gasPlatform), body));
  } catch (err) {
    console.error('Fatal request error', err instanceof Error ? err.stack : err);
    return JSON.stringify(FATAL);
  }
}

function json(text: string): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

/** Web app POST (phone app on github.io): JSON sent as text/plain to avoid the CORS preflight. */
export function doPost(e: GoogleAppsScript.Events.DoPost) {
  return json(respond(e?.postData?.contents ?? ''));
}

/** Web app GET: the office copy of the app (?health=1 returns a JSON health check). */
export function doGet(e: GoogleAppsScript.Events.DoGet) {
  if (e?.parameter?.health) {
    return json(JSON.stringify({ ok: true, data: { name: 'eifo-kulam', version: APP_VERSION, time: new Date().toISOString() } }));
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('איפה כולם')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Office copy bridge: google.script.run.api(body) from the page served by doGet. */
export function api(body: string): string {
  return respond(typeof body === 'string' ? body : '');
}

const REMINDER_HANDLER = 'weeklyReminderTrigger';

/**
 * Run once from the editor (approve "manage triggers"): (re)creates the Wednesday reminder trigger.
 * Reads and writes no Sheet data.
 */
export function installTriggers() {
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === REMINDER_HANDLER) ScriptApp.deleteTrigger(t);
  }
  // Fires somewhere in 07:05-07:35; the GitHub run then waits for 07:30 if it is early
  ScriptApp.newTrigger(REMINDER_HANDLER).timeBased().onWeekDay(ScriptApp.WeekDay.WEDNESDAY).atHour(7).nearMinute(20).inTimezone('Asia/Jerusalem').create();
  console.log('Wednesday reminder trigger installed (about 07:05-07:35 Israel time)');
}

/** Time-driven trigger: starts the weekly reminder run on GitHub. A thrown error makes Google email the owner. */
export function weeklyReminderTrigger() {
  ensureSchemaIfNeeded();
  const ctx = makeCtx(new Repo(openTables()), gasPlatform);
  if (!dispatchWeeklyReminder(ctx)) throw new Error('Could not start the weekly reminder on GitHub (check GITHUB_DISPATCH_TOKEN)');
  console.log('Weekly reminder run started on GitHub');
}

/** Run once from the Apps Script editor: authorizes the script, creates the tabs and the reminder trigger. */
export function setup() {
  ensureSchema();
  installTriggers();
  console.log(`Ready: ${spreadsheet().getUrl()}`);
}
