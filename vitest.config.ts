import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// Tests run from the repo root; web tests opt into happy-dom per file
export default defineConfig({
  plugins: [preact()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
