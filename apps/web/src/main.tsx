import React from 'react';
import ReactDOM from 'react-dom/client';
import './font.css';
import '@veloradesk/ui/tokens.css';
import './style.css';
import { App } from './App';
import { platform } from '@veloradesk/core/platform';

// Resolve appearance before the first React layout, including container queries.
let savedTheme = 'system';
try { savedTheme = localStorage.getItem('velora-theme') ?? 'system'; } catch { /* Storage is optional. */ }
document.documentElement.dataset.theme = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
if (!platform.desktop && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* First load remains usable if registration is blocked. */ }); });
}
