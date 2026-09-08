// 재물조사 앱 설치 주소 — admin QR과 user QR이 **같은 값**을 쓰도록 여기서만 계산합니다.
//
// 예전에는 두 화면이 각자 다른 환경변수를 읽어서 서로 다른 주소를 QR로 내보냈습니다.
// (user는 VITE_INVENTORY_APP_URL, admin은 VITE_PUBLIC_URL → 미설정이라 localhost)

/**
 * 우선순위
 *   1. `VITE_INVENTORY_APP_URL` — start-ngrok-tunnel.ps1 이 터널을 열 때마다 `.env.local` 에 자동으로 써 넣는 값
 *   2. `VITE_PUBLIC_URL` + `/inventory.html` — 고정 배포 주소가 있는 경우
 *   3. 현재 origin + `/inventory.html` — 같은 네트워크에서만 통하는 폴백
 *
 * 폰이 실제로 열어야 하는 건 재물조사 PWA(`/inventory.html`) 또는 설치 안내 페이지(`/install`)입니다.
 * `/inventory` 는 라우트가 아니라 메인 허브 앱이 뜨므로 쓰면 안 됩니다.
 */
export function inventoryInstallUrl(): string {
  const productionInventoryUrl = 'https://ebs-ai-hub.vercel.app/inventory.html'

  // 운영 화면을 공개 도메인에서 열었다면 그 origin을 그대로 사용합니다.
  // Vercel의 branch/preview URL은 Deployment Protection이 적용될 수 있으므로,
  // 빌드 시 주입된 URL보다 사용자가 실제로 연 공개 Production 도메인이 안전합니다.
  const currentOrigin = window.location.origin.replace(/\/$/, '')
  const hostname = window.location.hostname.toLowerCase()
  const isPrivateHost = hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname.endsWith('.local')
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  const isProtectedVercelHost = hostname.endsWith('-projects.vercel.app')

  if (isPrivateHost || isProtectedVercelHost) {
    return withApiOrigin(productionInventoryUrl)
  }

  if (/^https?:\/\//i.test(currentOrigin)) {
    return withApiOrigin(`${currentOrigin}/inventory.html`)
  }

  const direct = (import.meta.env.VITE_INVENTORY_APP_URL as string | undefined)?.trim().replace(/\/$/, '')
  if (direct) return withApiOrigin(direct)
  const origin = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim().replace(/\/$/, '')
    || window.location.origin
  return withApiOrigin(`${origin}/inventory.html`)
}

function withApiOrigin(url: string): string {
  const result = new URL(url)
  result.searchParams.set('api', getInventoryApiOrigin())
  return result.toString()
}

/** 설치 주소가 외부에서도 열리는 주소인지 (LAN 폴백이면 false). */
export function isExternalInstallUrl(): boolean {
  try {
    const hostname = new URL(inventoryInstallUrl()).hostname.toLowerCase()
    return hostname !== 'localhost'
      && hostname !== '127.0.0.1'
      && !/^10\./.test(hostname)
      && !/^192\.168\./.test(hostname)
      && !/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  } catch {
    return false
  }
}
import { getInventoryApiOrigin } from './inventoryApiClient'
