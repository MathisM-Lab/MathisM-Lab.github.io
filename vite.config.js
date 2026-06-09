import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'MonPortefeuille',
        short_name: 'Portefeuille',
        description: 'Suivi personnel d\'investissements (PEA, Livret A, CTO)',
        theme_color: '#0D1117',
        background_color: '#0D1117',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'fr',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Ajoute notre gestionnaire de push au service worker généré.
        importScripts: ['push-sw.js']
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  server: {
    host: true,
    port: 5173
  }
});
