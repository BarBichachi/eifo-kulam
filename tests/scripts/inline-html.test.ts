import { describe, expect, it } from 'vitest';
import { inlineHtml } from '../../scripts/lib/inline-html.ts';

const BUILT = `<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="icon" href="./icons/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="./icons/apple-touch-icon.png" />
    <script type="module" crossorigin src="./assets/index-abc.js"></script>
    <link rel="stylesheet" crossorigin href="./assets/index-def.css">
  </head>
  <body><div id="app"></div></body>
</html>`;

const ASSETS: Record<string, string> = {
  'assets/index-abc.js': 'const s = "</script>"; console.log(s);',
  'assets/index-def.css': 'body{color:red}',
};

describe('inlineHtml (office copy for Apps Script)', () => {
  it('inlines JS and CSS, drops PWA links and keeps scripts from closing early', () => {
    const out = inlineHtml(BUILT, (p) => ASSETS[p] ?? '');
    expect(out).toContain('<style>\nbody{color:red}\n</style>');
    expect(out).toContain('<script type="module">\nconst s = "<\\/script>"; console.log(s);\n</script>');
    expect(out).not.toMatch(/manifest|apple-touch-icon|rel="icon"|src="\.\/assets/);
  });

  it('fails loudly if any local file reference would be left behind', () => {
    const html = BUILT.replace('<body>', '<body><img src="./icons/x.png">');
    expect(() => inlineHtml(html, (p) => ASSETS[p] ?? '')).toThrow('Unresolved local reference');
  });
});
