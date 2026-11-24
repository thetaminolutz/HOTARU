import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/hotaru/").
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      // The manifest is hand-written in public/ so iOS meta tags and icons stay in one place.
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest,json,svg,txt}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        // Never touch the network at runtime: no runtimeCaching rules at all.
      },
      devOptions: { enabled: false },
    }),
  ],
});
