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
  const direct = (import.meta.env.VITE_INVENTORY_APP_URL as string | undefined)?.trim().replace(/\/$/, '')
  if (direct) return direct
  const origin = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim().replace(/\/$/, '')
    || window.location.origin
  return `${origin}/inventory.html`
}

/** 설치 주소가 외부에서도 열리는 주소인지 (LAN 폴백이면 false). */
export function isExternalInstallUrl(): boolean {
  return !!(
    (import.meta.env.VITE_INVENTORY_APP_URL as string | undefined)?.trim()
    || (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim()
  )
}
