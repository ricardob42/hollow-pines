import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: { target: 'es2022', chunkSizeWarningLimit: 1000 },
  plugins: [VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icon.svg'],
    manifest: {
      name: 'Hollow Pines', short_name: 'Hollow Pines',
      description: 'Night survival horror in an endless forest. Flashlight, blade, rifle. Plays offline.',
      theme_color: '#050706', background_color: '#050706',
      display: 'fullscreen', orientation: 'landscape', start_url: '/', scope: '/',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'], navigateFallback: '/index.html', cleanupOutdatedCaches: true },
  })],
});
