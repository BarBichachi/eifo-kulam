// Deploys the pushed Apps Script code to a stable web app URL.
// First run creates the deployment and saves GAS_DEPLOYMENT_ID + API_URL to .env; later runs update it in place,
// so the URL (used by the phone app and the office copy) never changes and the Sheet data is untouched.
import { clasp } from './clasp.ts';
import { loadEnv, setEnvVar } from './lib/env.ts';

loadEnv();
const description = `eifo-kulam ${new Date().toISOString()}`;
const existing = process.env.GAS_DEPLOYMENT_ID;
const output = existing
  ? clasp(['redeploy', existing, '--description', description], true)
  : clasp(['deploy', '--description', description], true);
console.log(output.trim());

const id = existing ?? output.match(/AKfy[\w-]{20,}/)?.[0];
if (!id) throw new Error('Could not find the deployment id in the clasp output above');
if (!existing) setEnvVar('GAS_DEPLOYMENT_ID', id);
const url = `https://script.google.com/macros/s/${id}/exec`;
setEnvVar('API_URL', url);
console.log(`Web app (API + office copy): ${url}`);
