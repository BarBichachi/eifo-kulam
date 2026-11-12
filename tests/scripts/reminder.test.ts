import { execFile } from 'node:child_process';
import { createECDH, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';
import { generateRequestDetails, generateVAPIDKeys } from 'web-push';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PROP } from '../../backend/platform.ts';
import { handle } from '../../backend/router.ts';
import type { PushSub } from '../../shared/api.ts';
import { runReminder, type Sender } from '../../scripts/lib/reminder-run.ts';
import { ADMIN, ALICE, BOB, world, type World } from '../backend/world.ts';

const SVC = randomBytes(32).toString('hex');
const VAPID = generateVAPIDKeys();
const APP_URL = 'https://example.github.io/eifo-kulam/';

/** Browser-like subscription keys (P-256 public key + 16-byte auth secret). */
function keys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey('base64url'), auth: randomBytes(16).toString('base64url') };
}

describe('weekly reminder pipeline (real router over HTTP, real payload encryption, fake push service)', () => {
  let server: Server;
  let w: World;
  const sent: { endpoint: string; payload: { title: string; url: string } }[] = [];
  let statusFor: Record<string, number>;

  // Encrypts exactly like a real send (fails on bad keys), then answers with a scripted push-service status
  const send: Sender = async (sub: PushSub, body, topic) => {
    const details = generateRequestDetails({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
      vapidDetails: { subject: APP_URL, publicKey: VAPID.publicKey, privateKey: VAPID.privateKey }, topic, TTL: 60,
    });
    expect(details.headers['Content-Encoding']).toBe('aes128gcm');
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(body) });
    return statusFor[sub.endpoint] ?? 201;
  };

  beforeAll(async () => {
    w = world();
    w.p.propsData.set(PROP.SERVICE_TOKEN, SVC);
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(handle(w.ctx, body))));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    process.env.API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.SERVICE_TOKEN = SVC;
    w.ok('pushSubscribe', { token: w.loginAs(ALICE), subscription: { endpoint: 'https://push.example/alice', keys: keys() } });
    w.ok('pushSubscribe', { token: w.loginAs(BOB), subscription: { endpoint: 'https://push.example/bob', keys: keys() } });
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  beforeEach(() => {
    sent.length = 0;
    statusFor = { 'https://push.example/bob': 410 };
  });

  const wednesday0730 = () => new Date('2026-11-18T05:30:00Z');

  it('sends once per week, records results and drops subscriptions the browser revoked', async () => {
    expect(await runReminder({ appUrl: APP_URL, send, now: wednesday0730, log: () => {} })).toBe('sent');
    expect(sent.map((s) => s.endpoint).sort()).toEqual(['https://push.example/alice', 'https://push.example/bob']);
    expect(sent[0]!.payload.url).toBe(`${APP_URL}#/me/2026-11-22`);
    expect(w.tables.push!.data.map((r) => [r.memberId, r.lastResult])).toEqual([[ALICE.id, '201']]);

    sent.length = 0;
    expect(await runReminder({ appUrl: APP_URL, send, now: wednesday0730, log: () => {} })).toBe('already-sent');
    expect(sent).toHaveLength(0);
  });

  it('waits for 07:30 on the early run and skips the off-DST run', async () => {
    const waits: number[] = [];
    const res = await runReminder({ appUrl: APP_URL, send, now: () => new Date('2027-06-02T04:05:00Z'), sleep: async (ms) => void waits.push(ms), log: () => {} });
    expect(waits).toEqual([25 * 60_000]);
    expect(res).toBe('sent');
    expect(await runReminder({ appUrl: APP_URL, send, now: () => new Date('2026-11-25T04:05:00Z'), log: () => {} })).toBe('skipped');
  });

  it('releases the weekly claim when nothing could be delivered, so the fallback run retries', async () => {
    statusFor = { 'https://push.example/alice': 0 };
    const now = () => new Date('2026-12-02T05:30:00Z');
    await expect(runReminder({ appUrl: APP_URL, send, now, log: () => {} })).rejects.toThrow('No push was delivered');
    statusFor = {};
    expect(await runReminder({ appUrl: APP_URL, send, now, log: () => {} })).toBe('sent');
  });

  it('test mode pushes only to the requesting member, any day', async () => {
    expect(await runReminder({ appUrl: APP_URL, send, memberId: ALICE.id, now: () => new Date('2026-11-20T12:00:00Z'), log: () => {} })).toBe('test');
    expect(sent.map((s) => s.payload.title)).toEqual(['בדיקת התראות ✅']);
    await expect(runReminder({ appUrl: APP_URL, send, memberId: ADMIN.id, log: () => {} })).rejects.toThrow('no registered devices');
  });

  it('the CLI runs under plain node (as in GitHub Actions) and reaches the backend', async () => {
    const run = promisify(execFile);
    const env = { ...process.env, APP_URL, VAPID_PUBLIC_KEY: VAPID.publicKey, VAPID_PRIVATE_KEY: VAPID.privateKey, MEMBER_ID: ADMIN.id };
    const err = await run(process.execPath, ['scripts/reminder.ts'], { env }).catch((e: { stderr: string; code: number }) => e);
    expect('code' in err && err.code).toBe(1);
    expect('stderr' in err && err.stderr).toContain('has no registered devices');
  }, 30_000);
});
