import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(<App />)

// Register the PWA service worker only in production builds. In dev we skip it so
// Vite's HMR (live phone testing) is never intercepted by SW caching.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker 등록 실패:', err)
    })
  })
}
