// 재물조사 PWA 전용 진입점 — inventory.html 에서 로드됨.
// 메인 앱(index.html / main.tsx)과 완전히 분리되어 독립 실행됩니다.
//
// Service Worker 등록은 dev/prod 모두에서 수행합니다.
// dev에서 SW가 활성화되면 HMR이 방해받을 수 있으므로 SW 등록만 하고 캐싱 전략은
// SW 내부에서 /api 경로를 제외해 Vite proxy가 계속 동작합니다.

import { createRoot } from 'react-dom/client'
import './index.css'
import InventoryStandaloneApp from './apps/inventory/InventoryStandaloneApp'

createRoot(document.getElementById('root')!).render(<InventoryStandaloneApp />)

// dev/prod 모두에서 재물조사 전용 SW 등록
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw-inventory.js', { scope: '/' })
      .then((reg) => {
        console.log('[재물조사 PWA] SW 등록 완료:', reg.scope)
      })
      .catch((err) => {
        console.warn('[재물조사 PWA] SW 등록 실패:', err)
      })
  })
}
