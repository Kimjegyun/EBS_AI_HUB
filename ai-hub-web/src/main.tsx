import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(<App />)

// Register the PWA service worker only in production builds. In dev we skip it so
// Vite's HMR (live phone testing) is never intercepted by SW caching.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Per-portal scope (/user/, /admin/) so each installs as its own home-screen app.
    const base = import.meta.env.BASE_URL
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch((err) => {
      console.warn('Service worker 등록 실패:', err)
    })
  })
}
