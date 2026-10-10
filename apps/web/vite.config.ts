import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig(({ mode }) => {
  const base = mode === 'desktop' ? '/' : (process.env.BASE_PATH ?? '/');
  return {
  base,
  plugins: [react(), tailwind(), ...(mode === 'desktop' ? [] : [VitePWA({
    registerType: 'prompt', injectRegister: null,
    includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
    manifest: { id: base, name: 'VeloraDesk', short_name: 'VeloraDesk', description: 'A calm space for your days, ideas and everything between.', start_url: `${base}?source=homescreen`, scope: base, display: 'standalone', background_color: '#f5f5f7', theme_color: '#2268bf', icons: [{ src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' }, { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' }, { src: `${base}icon-maskable.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }] },
    workbox: { clientsClaim: true, globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], navigateFallback: 'index.html', cleanupOutdatedCaches: true, importScripts: [`${base}push-handler.js`], maximumFileSizeToCacheInBytes: 2 * 1024 * 1024 }
  })])],
  build: { manifest: true, target: 'safari17', outDir: mode === 'desktop' ? 'dist-desktop' : 'dist', sourcemap: false },
  server: { strictPort: true, port: 5173 }
}; });
