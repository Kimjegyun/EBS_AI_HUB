import { lazy, Suspense } from 'react'
import { Icon } from '../components/Icon'
import type { AppContext, AppPlugin } from './types'

// Lazy-loaded so the heavy deps (xlsx, html5-qrcode) are only fetched when the
// 재물조사 app is actually opened — keeps the main bundle lean.
const LazyInventory = lazy(() => import('./inventory/InventoryApp'))

function InventoryBody(ctx: AppContext) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-2 text-on-surface-variant text-body-sm py-8">
          <Icon name="progress_activity" className="animate-spin" />
          재물조사 모듈 불러오는 중...
        </div>
      }
    >
      <LazyInventory {...ctx} />
    </Suspense>
  )
}

export const inventoryApp: AppPlugin = {
  id: 'inventory',
  name: '재물조사',
  icon: 'inventory_2',
  description:
    'QR 스캔으로 자산을 실사하고 확인자·확인여부·조사일을 기록해 연도별 엑셀로 내보내는 재물조사 앱입니다. PC·태블릿·휴대폰에서 모두 사용할 수 있습니다.',
  category: '운영',
  version: '1.0.0',
  defaultSize: { w: 5, h: 6, minW: 3, minH: 4 },
  Body: InventoryBody,
}
