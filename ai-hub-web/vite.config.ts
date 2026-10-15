import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'
import fs from 'fs'
import path from 'path'

// Asset-number OCR (src/apps/inventory/assetOcr.ts) loads Tesseract's English model
// from `${BASE_URL}tesseract/eng.traineddata.gz`. Serve/emit it straight from
// node_modules so the 2.9MB model is self-hosted without being committed.
const OCR_MODEL = path.resolve(__dirname, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz')
function ocrModel(): Plugin {
  return {
    name: 'ocr-model',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.split('?')[0].endsWith('/tesseract/eng.traineddata.gz')) return next()
        res.setHeader('Content-Type', 'application/gzip')
        fs.createReadStream(OCR_MODEL).pipe(res)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'tesseract/eng.traineddata.gz', source: fs.readFileSync(OCR_MODEL) })
    },
  }
}

// Disable Git checkpoints feature warning
process.env.VITE_DISABLE_CHECKPOINTS = 'true'

// https://vite.dev/config/
export default defineConfig({
  // Trusted local HTTPS via mkcert (installs a local CA into the OS trust store).
  // HTTPS is required so phones on the LAN can use the camera (getUserMedia / QR
  // scan) and install the PWA — browsers block those APIs on non-secure origins.
  plugins: [react(), mkcert(), ocrModel()],
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
  // The barcode decoder worker (zxing-cpp WASM) is an ES module worker.
  worker: { format: 'es' },
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
      '/health': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/rootCA.crt': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
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
      '/health': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/rootCA.crt': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
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
