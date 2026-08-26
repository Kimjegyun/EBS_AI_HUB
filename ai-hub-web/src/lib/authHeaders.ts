// 로컬 API 는 /api/ai, /api/environment 등 대부분의 경로에서 인증을 요구한다.
// 토큰 저장 키는 localServerApi.login() 이 쓰는 'auth_token' 이며,
// remoteApps·inventoryApiClient 와 같은 순서로 폴백한다.

export function authToken(): string {
  const injected = (import.meta.env.VITE_INVENTORY_TOKEN as string | undefined)?.trim()
  if (injected) return injected
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem('auth_token') || localStorage.getItem('authToken') || ''
}

export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = authToken()
  return {
    'ngrok-skip-browser-warning': '1',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

/** 401 과 403 은 원인이 달라서 메시지를 나눈다. */
export function describeAuthStatus(status: number): string | null {
  if (status === 401) return '로그인이 필요합니다 (401). 로그아웃 후 다시 로그인해 주세요.'
  if (status === 403) return '관리자 권한이 필요합니다 (403).'
  return null
}
