import type { Action, ApiMap, ApiResponse } from '../../../shared/api.ts';
import { API_URL } from '../config.ts';

const TIMEOUT_MS = 30_000;

/** Failure with a stable code; message is already user-facing Hebrew. */
export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

type Transport = (body: string) => Promise<unknown>;

const NETWORK_MESSAGE = 'אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.';

// Apps Script: POST text/plain avoids the CORS preflight; the 302 to googleusercontent is followed
const httpTransport: Transport = async (body) => {
  if (!API_URL) throw new ApiError('NOT_CONFIGURED', 'כתובת השרת לא הוגדרה (VITE_API_URL).');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (err) {
    console.error('API request failed', err);
    throw controller.signal.aborted
      ? new ApiError('TIMEOUT', 'השרת לא ענה בזמן. נסו שוב בעוד רגע.')
      : new ApiError('NETWORK', NETWORK_MESSAGE);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new ApiError('NETWORK', `השרת החזיר שגיאה (${res.status}). נסו שוב.`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // Usually a network filter or Google sign-in/error page answering instead of the API
    console.error('API returned non-JSON', res.url, text.slice(0, 300));
    throw new ApiError('BAD_RESPONSE', 'התקבלה תשובה לא צפויה מהשרת (ייתכן שהרשת חוסמת). נסו מהטלפון.');
  }
};

/** Minimal typing for the Apps Script client bridge (only present on the office copy). */
interface GoogleScriptRun {
  withSuccessHandler(fn: (value: string) => void): GoogleScriptRun;
  withFailureHandler(fn: (error: Error) => void): GoogleScriptRun;
  api(body: string): void;
}
declare const google: { script: { run: GoogleScriptRun } };

// Office copy: same-origin call into the backend's api() function, no cross-site request at all
const gasTransport: Transport = (body) =>
  new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((text) => {
        try {
          resolve(JSON.parse(text));
        } catch {
          reject(new ApiError('BAD_RESPONSE', 'התקבלה תשובה לא צפויה מהשרת.'));
        }
      })
      .withFailureHandler((err) => {
        console.error('google.script.run failed', err);
        reject(new ApiError('NETWORK', NETWORK_MESSAGE));
      })
      .api(body);
  });

let transport: Promise<Transport> | null = null;

function getTransport(): Promise<Transport> {
  if (!transport) {
    // Inline env checks so each build drops the transports it does not use
    transport = import.meta.env.VITE_API_URL === 'mock'
      ? import('../mock/mock-backend.ts').then((m) => m.mockTransport)
      : Promise.resolve(import.meta.env.MODE === 'office' ? gasTransport : httpTransport);
  }
  return transport;
}

/** Calls one backend action. Throws ApiError on any failure. */
export async function api<A extends Action>(action: A, req: ApiMap[A]['req'], token?: string): Promise<ApiMap[A]['res']> {
  const send = await getTransport();
  const body = (await send(JSON.stringify({ action, token, ...req }))) as ApiResponse<A>;
  if (!body || typeof body !== 'object') throw new ApiError('NETWORK', 'תשובה לא תקינה מהשרת.');
  if (!body.ok) throw new ApiError(body.error.code, body.error.message);
  return body.data;
}
