import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Default: the phone PWA for GitHub Pages under /eifo-kulam/.
// Mode "office": a single-file copy served by Apps Script (inlined by scripts/build-gas.ts), no PWA assets.
export default defineConfig(({ mode }) => {
  const office = mode === 'office';
  return {
    root: 'web',
    base: office ? './' : '/eifo-kulam/',
    envDir: '..',
    publicDir: office ? false : 'public',
    plugins: [preact()],
    build: {
      outDir: office ? '../build/office-web' : '../dist',
      emptyOutDir: true,
      target: 'es2022',
      // Everything must end up inline in one HTML file for Apps Script
      assetsInlineLimit: office ? Number.MAX_SAFE_INTEGER : undefined,
      cssCodeSplit: !office,
      modulePreload: office ? false : undefined,
    },
    server: { host: '127.0.0.1', port: 5173 },
  };
});
