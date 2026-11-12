/** Error with a stable code for callers plus an actionable Hebrew message for users. */
export class AppError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export const ERR = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  UNKNOWN_PHONE: 'UNKNOWN_PHONE',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  INTERNAL: 'INTERNAL',
} as const;
