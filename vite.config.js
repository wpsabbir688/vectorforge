import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    // Playwright specs live here too but run under `playwright test` only;
    // vitest must not try to collect them (it fails at import time).
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
});
