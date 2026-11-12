// Builds everything Apps Script serves into build/gas/:
//   Code.js         backend bundle (esbuild) + global entry points
//   Index.html      office copy of the web app (Vite "office" mode, inlined into one file)
//   appsscript.json manifest
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build as viteBuild } from 'vite';
import { loadEnv } from './lib/env.ts';
import { inlineHtml } from './lib/inline-html.ts';

const OUT_DIR = 'build/gas';
const OFFICE_DIR = 'build/office-web';
const GLOBAL = '__EifoKulam';

// Apps Script only sees top-level function declarations, so each export gets a thin global wrapper
const ENTRY_POINTS = ['doGet', 'doPost', 'setup', 'api'];

loadEnv();
mkdirSync(OUT_DIR, { recursive: true });
await build({
  entryPoints: ['backend/main.ts'],
  bundle: true,
  format: 'iife',
  globalName: GLOBAL,
  target: 'es2020',
  charset: 'utf8',
  legalComments: 'none',
  outfile: `${OUT_DIR}/Code.js`,
});
const wrappers = ENTRY_POINTS.map((fn) => `function ${fn}(e) { return ${GLOBAL}.${fn}(e); }`).join('\n');
const code = readFileSync(`${OUT_DIR}/Code.js`, 'utf8');
writeFileSync(`${OUT_DIR}/Code.js`, `${code}\n${wrappers}\n`);
copyFileSync('backend/appsscript.json', `${OUT_DIR}/appsscript.json`);
console.log(`Built ${OUT_DIR}/Code.js (${Math.round(code.length / 1024)} KB)`);

// Office copy links share texts to the phone app, so it needs the public URL at build time
const appUrl = process.env.APP_URL;
if (!appUrl) throw new Error('Missing APP_URL (set it in .env, see .env.example)');
process.env.VITE_APP_URL = appUrl;
process.env.VITE_API_URL = '';
process.env.VITE_APP_VERSION ??= new Date().toISOString().slice(0, 16);
await viteBuild({ mode: 'office', logLevel: 'warn' });
const html = inlineHtml(readFileSync(join(OFFICE_DIR, 'index.html'), 'utf8'), (p) => readFileSync(join(OFFICE_DIR, p), 'utf8'));
writeFileSync(`${OUT_DIR}/Index.html`, html);
console.log(`Built ${OUT_DIR}/Index.html (${Math.round(html.length / 1024)} KB)`);
