// One-stop setup of secrets: creates missing values in .env, then stores them as Apps Script Script Properties.
// Usage: npm run configure
import { randomBytes } from 'node:crypto';
import { generateVAPIDKeys } from 'web-push';
import { callApi, loadEnv, requireEnv, setEnvVar } from './lib/env.ts';

loadEnv();

if (!process.env.SERVICE_TOKEN) {
  setEnvVar('SERVICE_TOKEN', randomBytes(32).toString('hex'));
  console.log('Generated SERVICE_TOKEN in .env');
}
if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  const keys = generateVAPIDKeys();
  setEnvVar('VAPID_PUBLIC_KEY', keys.publicKey);
  setEnvVar('VAPID_PRIVATE_KEY', keys.privateKey);
  console.log('Generated a VAPID key pair in .env');
}

requireEnv('API_URL');
const { configured } = await callApi('svcConfigure', {
  config: {
    serviceToken: requireEnv('SERVICE_TOKEN'),
    vapidPublicKey: requireEnv('VAPID_PUBLIC_KEY'),
    ...(process.env.GITHUB_REPO ? { githubRepo: process.env.GITHUB_REPO } : {}),
    ...(process.env.GITHUB_DISPATCH_TOKEN ? { githubDispatchToken: process.env.GITHUB_DISPATCH_TOKEN } : {}),
  },
});
console.log(`Script Properties updated: ${configured.join(', ')}`);
const health = await callApi('health', {});
console.log(`Backend OK: ${health.name} ${health.version} at ${health.time}`);
