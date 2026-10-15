const RETURN_URL_ORIGIN = 'https://portal-return.invalid'
const GOOGLE_RETURN_TO_KEY = 'ai-hub-google-login-return-to-v1'
const GOOGLE_RETURN_TO_TTL_MS = 15 * 60 * 1000

type ReturnToStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function getExternalAppReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[%\\]/.test(value.split(/[?#]/)[0]) || value.split(/[?#]/)[0].split('/').some(part => part === '.' || part === '..')) return null

  try {
    const url = new URL(value, RETURN_URL_ORIGIN)
    if (url.origin !== RETURN_URL_ORIGIN) return null
    if (!/^\/[A-Za-z][A-Za-z0-9_-]*(?:\/|$)/.test(url.pathname) || /^\/(?:user|admin|api)(?:\/|$)/.test(url.pathname)) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

export function rememberGoogleLoginReturnTo(
  value: string | null | undefined,
  storage: ReturnToStorage = window.sessionStorage,
  now = Date.now(),
): void {
  const returnTo = getExternalAppReturnTo(value)
  if (!returnTo) {
    storage.removeItem(GOOGLE_RETURN_TO_KEY)
    return
  }
  storage.setItem(GOOGLE_RETURN_TO_KEY, JSON.stringify({ returnTo, savedAt: now }))
}

export function readGoogleLoginReturnTo(
  storage: ReturnToStorage = window.sessionStorage,
  now = Date.now(),
): string | null {
  const raw = storage.getItem(GOOGLE_RETURN_TO_KEY)
  if (!raw) return null

  let saved: { returnTo?: unknown; savedAt?: unknown }
  try {
    saved = JSON.parse(raw) as typeof saved
  } catch {
    storage.removeItem(GOOGLE_RETURN_TO_KEY)
    return null
  }

  const savedAt = saved.savedAt
  const age = typeof savedAt === 'number' ? now - savedAt : Number.POSITIVE_INFINITY
  const returnTo = typeof saved.returnTo === 'string' ? getExternalAppReturnTo(saved.returnTo) : null
  if (!returnTo || age < 0 || age > GOOGLE_RETURN_TO_TTL_MS) {
    storage.removeItem(GOOGLE_RETURN_TO_KEY)
    return null
  }
  return returnTo
}

export function clearGoogleLoginReturnTo(storage: ReturnToStorage = window.sessionStorage): void {
  storage.removeItem(GOOGLE_RETURN_TO_KEY)
}
