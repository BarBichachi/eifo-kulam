// Renders the PNG app icons from SVG with headless Edge/Chrome (no image library needed).
// Usage: npm run icons   (set BROWSER to override the browser path)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE = 'web/src/assets/icon.svg';
const OUT = 'web/public/icons';
// The app imports the master SVG; the manifest and favicon need a copy in public/
copyFileSync(SOURCE, `${OUT}/icon.svg`);
const base = readFileSync(SOURCE, 'utf8');
const inner = base.replace(/^[\s\S]*?<\/defs>/, '').replace(/<rect[^>]*\/>/, '').replace(/<\/svg>\s*$/, '');
const defs = base.match(/<defs>[\s\S]*?<\/defs>/)?.[0] ?? '';

// Maskable: full-bleed background, artwork shrunk into the 80% safe zone
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}<rect width="512" height="512" fill="url(#g)"/><g transform="translate(51.2 51.2) scale(0.8)">${inner}</g></svg>`;
// Opaque square for iOS (it rounds corners itself)
const apple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}<rect width="512" height="512" fill="url(#g)"/>${inner}</svg>`;
// Android status-bar badge: white silhouette on transparent (the OS uses only the alpha channel)
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill-rule="evenodd" fill="#fff" d="M256 40c-86 0-156 68-156 153 0 115 156 255 156 255s156-140 156-255c0-85-70-153-156-153zM196 168a26 26 0 1 0 0.1 0zM256 168a26 26 0 1 0 0.1 0zM316 168a26 26 0 1 0 0.1 0z"/></svg>`;

const jobs: [string, string, number][] = [
  ['icon-192.png', base, 192],
  ['icon-512.png', base, 512],
  ['icon-maskable-512.png', maskable, 512],
  ['apple-touch-icon.png', apple, 180],
  ['badge-96.png', badge, 96],
];

const candidates = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter((p): p is string => !!p);
const browser = candidates.find((p) => existsSync(p));
if (!browser) throw new Error('No Edge/Chrome found. Set BROWSER=<path to browser executable>.');

const tmp = mkdtempSync(join(tmpdir(), 'eifo-icons-'));
try {
  for (const [name, svg, size] of jobs) {
    const html = join(tmp, `${name}.html`);
    writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--default-background-color=00000000', `--user-data-dir=${join(tmp, 'profile')}`,
      `--window-size=${size},${size}`, `--screenshot=${resolve(OUT, name)}`, pathToFileURL(html).href,
    ], { stdio: 'ignore' });
    console.log(`${OUT}/${name}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
