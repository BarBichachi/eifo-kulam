/** Everything the backend needs from Apps Script, injectable so handlers run in Vitest. */
export interface Platform {
  now(): Date;
  uuid(): string;
  sha256Hex(text: string): string;
  /** Runs fn while holding the script-wide lock (serializes all writers). */
  withLock<T>(fn: () => T): T;
  cache: {
    get(key: string): string | null;
    put(key: string, value: string, seconds: number): void;
    remove(key: string): void;
  };
  props: {
    get(key: string): string | null;
    set(key: string, value: string): void;
  };
  fetch(url: string, init?: { method?: 'get' | 'post'; headers?: Record<string, string>; body?: string }): { status: number; body: string };
  sleep(ms: number): void;
  log(message: string, detail?: unknown): void;
}

/** Script Property names. */
export const PROP = {
  SERVICE_TOKEN: 'SERVICE_TOKEN',
  VAPID_PUBLIC_KEY: 'VAPID_PUBLIC_KEY',
  GITHUB_REPO: 'GITHUB_REPO',
  GITHUB_DISPATCH_TOKEN: 'GITHUB_DISPATCH_TOKEN',
  SCHEMA_VERSION: 'SCHEMA_VERSION',
} as const;
