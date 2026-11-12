import type { Platform } from './platform.ts';
import type { Repo } from './repo/repo.ts';

/** Per-request context passed to every handler. */
export interface Ctx {
  repo: Repo;
  p: Platform;
  /** Holds the script lock and re-reads tables first, so writes never use stale row indexes. */
  locked<T>(fn: () => T): T;
}

export function makeCtx(repo: Repo, p: Platform): Ctx {
  return {
    repo,
    p,
    locked: (fn) =>
      p.withLock(() => {
        repo.invalidate();
        return fn();
      }),
  };
}

/** Short random id with a type prefix (m = member, s = status). */
export const newId = (ctx: Ctx, prefix: string): string => `${prefix}${ctx.p.uuid().replace(/-/g, '').slice(0, 10)}`;
