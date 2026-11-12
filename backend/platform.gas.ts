import type { Platform } from './platform.ts';

const LOCK_TIMEOUT_MS = 20_000;

/** Platform implementation over Apps Script services. */
export const gasPlatform: Platform = {
  now: () => new Date(),
  uuid: () => Utilities.getUuid(),
  sha256Hex: (text) =>
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
      .map((b) => ((b + 256) % 256).toString(16).padStart(2, '0'))
      .join(''),
  withLock: (fn) => {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(LOCK_TIMEOUT_MS)) throw new Error('Could not obtain the script lock');
    try {
      const result = fn();
      SpreadsheetApp.flush();
      return result;
    } finally {
      lock.releaseLock();
    }
  },
  cache: {
    get: (key) => CacheService.getScriptCache().get(key),
    put: (key, value, seconds) => CacheService.getScriptCache().put(key, value, seconds),
    remove: (key) => CacheService.getScriptCache().remove(key),
  },
  props: {
    get: (key) => PropertiesService.getScriptProperties().getProperty(key),
    set: (key, value) => {
      PropertiesService.getScriptProperties().setProperty(key, value);
    },
  },
  fetch: (url, init = {}) => {
    const res = UrlFetchApp.fetch(url, {
      method: init.method ?? 'get',
      headers: init.headers,
      payload: init.body,
      muteHttpExceptions: true,
      followRedirects: true,
    });
    return { status: res.getResponseCode(), body: res.getContentText() };
  },
  sleep: (ms) => Utilities.sleep(ms),
  log: (message, detail) => console.error(message, detail ?? ''),
};
