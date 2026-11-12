/** Sheet tabs and their columns. Order is only used when creating a tab; reads match by header name. */
export const SCHEMA = {
  members: ['id', 'name', 'phone', 'type', 'isAdmin', 'active', 'order'],
  statuses: ['id', 'label', 'emoji', 'color', 'category', 'requiresNote', 'active', 'order'],
  entries: ['date', 'memberId', 'statusId', 'note', 'updatedAt', 'updatedBy'],
  sessions: ['tokenHash', 'memberId', 'createdAt', 'lastSeenAt'],
  push: ['memberId', 'endpoint', 'p256dh', 'auth', 'createdAt', 'lastResult', 'lastResultAt'],
  holidays: ['date', 'name', 'isDayOff', 'source'],
  log: ['timestamp', 'actorId', 'memberId', 'date', 'before', 'after'],
  settings: ['key', 'value'],
} as const;

export type TableName = keyof typeof SCHEMA;

export const TABLE_NAMES = Object.keys(SCHEMA) as TableName[];

/** Bump when SCHEMA changes so deployed scripts add new tabs/columns on the next request. */
export const SCHEMA_VERSION = '1';
