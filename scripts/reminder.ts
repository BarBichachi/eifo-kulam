// Weekly reminder / test push sender, run by .github/workflows/reminder.yml (or locally: npm run reminder).
// Env: API_URL, SERVICE_TOKEN, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, APP_URL
//      MEMBER_ID (optional: test push to one member), FORCE=true (send now, skip the time window).
import { sendNotification } from 'web-push';
import { loadEnv, requireEnv } from './lib/env.ts';
import { runReminder, type Sender } from './lib/reminder-run.ts';

const TTL_SECONDS = 12 * 60 * 60;

loadEnv();
const appUrl = requireEnv('APP_URL');
const vapidDetails = { subject: appUrl, publicKey: requireEnv('VAPID_PUBLIC_KEY'), privateKey: requireEnv('VAPID_PRIVATE_KEY') };

// Real Web Push: returns the push service HTTP status, 0 for network errors
const send: Sender = async (sub, body, topic) => {
  try {
    const res = await sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
      TTL: TTL_SECONDS, urgency: 'high', topic, vapidDetails, timeout: 20_000,
    });
    return res.statusCode;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 0;
    console.error(`Push failed for member ${sub.memberId}: HTTP ${status} ${(err as Error).message}`);
    return status;
  }
};

try {
  await runReminder({ appUrl, memberId: process.env.MEMBER_ID?.trim() || undefined, force: process.env.FORCE === 'true', send });
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
