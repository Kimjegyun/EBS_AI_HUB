import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'
import path from 'path'

// Disable Git checkpoints feature warning
process.env.VITE_DISABLE_CHECKPOINTS = 'true'

// https://vite.dev/config/
export default defineConfig({
  // Trusted local HTTPS via mkcert (installs a local CA into the OS trust store).
  // HTTPS is required so phones on the LAN can use the camera (getUserMedia / QR
  // scan) and install the PWA — browsers block those APIs on non-secure origins.
  plugins: [react(), mkcert()],
  // Multi-page: inventory.html is a standalone PWA entry separate from index.html.
  // Dev server serves both; production build emits both HTML files.
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        inventory: path.resolve(__dirname, 'inventory.html'),
      },
    },
  },
  // react-draggable (used by react-grid-layout) references `process.env.DRAGGABLE_DEBUG`
  // at drag/resize start. The browser has no `process`, so this throws
  // "ReferenceError: process is not defined" and aborts every drag/resize.
  // Replace the token at build time so dragging and resizing work.
  define: {
    'process.env.DRAGGABLE_DEBUG': 'false',
  },
  // host:true exposes the dev server on the LAN so a phone can connect to
  // https://<PC-IP>:5173 and develop/test live (HMR included).
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
    },
  },
  // Same for `vite preview` (used to test the installed/offline PWA build).
  preview: {
    host: true,
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
    },
  },
})
