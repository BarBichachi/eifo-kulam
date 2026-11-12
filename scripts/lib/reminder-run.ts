// Weekly reminder / test push logic, separated from the CLI so it can be tested with a fake sender.
import type { PushResult, PushSub } from '../../shared/api.ts';
import { reminderDecision, reminderPayload, testPayload, type PushPayload } from '../../shared/reminder.ts';
import { callApi } from './env.ts';

export type Sender = (sub: PushSub, body: string, topic: string) => Promise<number>;

export interface ReminderOptions {
  appUrl: string;
  /** Test push to one member: no time window, no weekly claim. */
  memberId?: string;
  /** Send the weekly reminder now, ignoring the Wednesday 07:30 window. */
  force?: boolean;
  send: Sender;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

export interface Summary {
  ok: number;
  gone: number;
  failed: number;
}

export function summarize(results: PushResult[]): Summary {
  return {
    ok: results.filter((r) => r.status >= 200 && r.status < 300).length,
    gone: results.filter((r) => r.status === 404 || r.status === 410).length,
    failed: results.filter((r) => r.status === 0 || (r.status >= 300 && r.status !== 404 && r.status !== 410)).length,
  };
}

async function deliver(subs: PushSub[], payload: PushPayload, send: Sender): Promise<PushResult[]> {
  const body = JSON.stringify(payload);
  const topic = payload.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  return Promise.all(subs.map(async (s) => ({ endpoint: s.endpoint, status: await send(s, body, topic) })));
}

/** Runs one reminder (or test) send. Throws when nothing could be delivered so CI shows a failure. */
export async function runReminder(opts: ReminderOptions): Promise<string> {
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? console.log;

  if (opts.memberId) {
    const { subscriptions } = await callApi('svcPushList', { memberId: opts.memberId });
    if (!subscriptions.length) throw new Error(`Member ${opts.memberId} has no registered devices`);
    const results = await deliver(subscriptions, testPayload(opts.appUrl), opts.send);
    await callApi('svcPushReport', { results });
    const s = summarize(results);
    log(`Test push: ${JSON.stringify(s)}`);
    if (s.ok === 0) throw new Error('Test push was not delivered');
    return 'test';
  }

  if (!opts.force) {
    const decision = reminderDecision(now());
    if (decision.action === 'skip') {
      log(`Skipping: ${decision.reason}`);
      return 'skipped';
    }
    if (decision.action === 'wait') {
      log(`Waiting ${Math.round(decision.waitMs / 1000)}s until 07:30 Israel time`);
      await (opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(decision.waitMs);
    }
  }

  const payload = reminderPayload(now(), opts.appUrl);
  const { claimed } = await callApi('svcReminderClaim', { week: payload.week });
  if (!claimed) {
    log(`Reminder for week ${payload.week} was already sent`);
    return 'already-sent';
  }
  try {
    const { subscriptions } = await callApi('svcPushList', {});
    const results = await deliver(subscriptions, payload, opts.send);
    await callApi('svcPushReport', { results });
    const s = summarize(results);
    log(`Reminder for week ${payload.week}: ${subscriptions.length} devices ${JSON.stringify(s)}`);
    // Nothing delivered at all looks like an outage: release so the fallback run retries
    if (subscriptions.length > 0 && s.ok === 0 && s.gone < subscriptions.length) throw new Error('No push was delivered');
    return 'sent';
  } catch (err) {
    await callApi('svcReminderClaim', { week: payload.week, release: true }).catch(() => {});
    throw err;
  }
}
