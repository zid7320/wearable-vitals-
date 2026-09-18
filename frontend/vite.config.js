import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-icon.svg'],
      manifest: {
        name: 'Vitals Dashboard',
        short_name: 'Vitals',
        description: 'Live wearable vital signs monitoring dashboard',
        theme_color: '#020817',
        background_color: '#020817',
        display: 'standalone',
        icons: [
          { src: '/icons/pwa-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/pwa-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/pwa-maskable-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/vitals/'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.protocol === 'ws:' || url.protocol === 'wss:',
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
