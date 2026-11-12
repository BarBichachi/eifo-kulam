/** Apps Script web app URL, or "mock" for the in-browser fake backend (local dev and screenshots). */
export const API_URL: string = import.meta.env.VITE_API_URL ?? '';

export const IS_MOCK = API_URL === 'mock';

/**
 * "office": the copy served by Apps Script itself (script.google.com) for office PCs, where the
 * network isolates github.io. It talks to the backend through google.script.run and has no PWA/push.
 */
export const IS_OFFICE = import.meta.env.MODE === 'office';

/** Public app URL (share texts, notification links). Fixed at build time so the office copy links to the phone app. */
export const APP_URL: string = import.meta.env.VITE_APP_URL || new URL(import.meta.env.BASE_URL, window.location.origin).href;

export const STORAGE_PREFIX = 'eifo:';
