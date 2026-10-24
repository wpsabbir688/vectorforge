import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

// PWA: register the service worker (production builds only — the virtual
// module is a no-op in dev). With registerType 'autoUpdate' the new worker
// takes over on deploy (skipWaiting + clientsClaim), so a new Netlify deploy
// reaches users without manual cache clearing.
// The controllerchange reload applies the new bundle to the open tab — but
// ONLY if the user has not interacted yet. Reloading mid-gesture would yank
// the page out from under a drag (the canvas session lives in memory), so
// once any pointerdown has happened we leave the session alone; the new
// version applies on the next visit instead.
import { registerSW } from 'virtual:pwa-register';

if ('serviceWorker' in navigator) {
  registerSW({ immediate: true });
  let refreshing = false;
  let interacted = false;
  window.addEventListener('pointerdown', () => { interacted = true; }, { once: true, capture: true });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing && !interacted) {
      refreshing = true;
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
