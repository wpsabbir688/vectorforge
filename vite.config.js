import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Auto-update: a new Netlify deploy activates the new worker at once
      // (skipWaiting + clientsClaim) instead of waiting for every tab to close.
      registerType: 'autoUpdate',
      manifest: {
        name: 'VectorForge',
        short_name: 'VectorForge',
        description: 'Browser-based vector design studio — draw, trace, and export SVG/PNG.',
        theme_color: '#1e1e1e',
        background_color: '#1e1e1e',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell (index.html + hashed JS/CSS); old caches are
        // pruned on activation, so a deploy can never serve a stale bundle.
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    // Playwright specs live here too but run under `playwright test` only;
    // vitest must not try to collect them (it fails at import time).
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
});
