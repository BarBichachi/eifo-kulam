// Runs the project's clasp without a shell (keeps arguments with spaces intact on Windows) and trusts the
// OS certificate store, which networks with TLS inspection need. Usage: node scripts/clasp.ts <args...>
import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// clasp's package "exports" hide package.json, so read it from node_modules directly
const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '@google', 'clasp');
const bin = join(pkgDir, (JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as { bin: { clasp: string } }).bin.clasp);

/** Runs clasp; returns stdout when capture is true, otherwise streams to this terminal. */
export function clasp(args: string[], capture = false): string {
  const options: ExecFileSyncOptions = {
    env: { ...process.env, NODE_USE_SYSTEM_CA: '1' },
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  };
  return (execFileSync(process.execPath, [bin, ...args], options) as string | null) ?? '';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    clasp(process.argv.slice(2));
  } catch (err) {
    process.exitCode = (err as { status?: number }).status ?? 1;
  }
}
