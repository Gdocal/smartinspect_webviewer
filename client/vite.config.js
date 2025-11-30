import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
            manifest: {
                name: 'SmartInspect Web Viewer',
                short_name: 'SmartInspect',
                description: 'Real-time log viewer for SmartInspect',
                theme_color: '#1e293b',
                background_color: '#1e293b',
                display: 'standalone',
                orientation: 'any',
                start_url: '/',
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
                        purpose: 'maskable'
                    },
                    {
                        src: 'icon.svg',
                        sizes: 'any',
                        type: 'image/svg+xml'
                    }
                ]
            },
            workbox: {
                // Don't cache API calls or WebSocket connections
                navigateFallback: 'index.html',
                navigateFallbackDenylist: [/^\/api/, /^\/ws/],
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    }
                ]
            },
            devOptions: {
                enabled: true
            }
        })
    ],
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                secure: false
            },
            '/ws': {
                target: 'ws://localhost:3000',
                ws: true,
                changeOrigin: true,
                secure: false
            }
        }
    }
});
