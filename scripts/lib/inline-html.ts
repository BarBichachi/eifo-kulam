/**
 * Turns a Vite build's index.html into one self-contained HTML file (inline CSS and JS),
 * as required by Apps Script HtmlService. Drops PWA links (manifest, icons): the office copy has no PWA.
 */
export function inlineHtml(html: string, readAsset: (path: string) => string): string {
  const assetPath = (href: string) => href.replace(/^\.?\//, '').replace(/^[^?#]*?assets\//, 'assets/');
  let out = html
    .replace(/<link\b[^>]*\brel="(?:manifest|icon|apple-touch-icon)"[^>]*>\s*/g, '')
    .replace(/<link\b[^>]*\brel="modulepreload"[^>]*>\s*/g, '')
    .replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g, (_m, href: string) => `<style>\n${readAsset(assetPath(href))}\n</style>`)
    .replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (_m, src: string) => {
      // A literal "</script" inside the code would end the inline tag early
      const code = readAsset(assetPath(src)).replace(/<\/script/gi, '<\\/script');
      return `<script type="module">\n${code}\n</script>`;
    });
  const leftover = out.match(/\b(?:src|href)="(?!data:|https?:|#)[^"]+"/);
  if (leftover) throw new Error(`Unresolved local reference in office build: ${leftover[0]}`);
  out = out.replace(/\n{3,}/g, '\n\n');
  return out;
}
