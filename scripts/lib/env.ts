// Shared helpers for the Node scripts: .env access and backend calls.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Action, ApiMap, ApiResponse } from '../../shared/api.ts';

export const ENV_FILE = '.env';

/** Loads .env into process.env if present (real environment variables win). */
export function loadEnv(): void {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Set it in ${ENV_FILE} (see .env.example) or the environment.`);
  return value;
}

/** Adds or replaces KEY=value in .env and in process.env. */
export function setEnvVar(key: string, value: string): void {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter((l) => l !== '') : [];
  const index = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (index >= 0) lines[index] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  writeFileSync(ENV_FILE, `${lines.join('\n')}\n`);
  process.env[key] = value;
}

/** Calls the Apps Script API with the service token. Throws with the server's message on failure. */
export async function callApi<A extends Action>(action: A, req: ApiMap[A]['req'] & { token?: string }): Promise<ApiMap[A]['res']> {
  const url = requireEnv('API_URL');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token: process.env.SERVICE_TOKEN, ...req }),
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let body: ApiResponse<A>;
  try {
    body = JSON.parse(text) as ApiResponse<A>;
  } catch {
    throw new Error(`${action}: HTTP ${res.status}, not JSON (is the web app deployed with access "Anyone"?): ${text.slice(0, 200)}`);
  }
  if (!body.ok) throw new Error(`${action}: ${body.error.code} ${body.error.message}`);
  return body.data;
}
