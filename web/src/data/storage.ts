import { STORAGE_PREFIX } from '../config.ts';

// localStorage can throw (private mode, quota, disabled); persistence is best-effort everywhere

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* best-effort */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* best-effort */
  }
}
