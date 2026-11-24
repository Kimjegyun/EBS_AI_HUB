/** Never forward stored provider credentials through a redirect to another host. */
export function providerFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const target = new URL(url)
  if (target.username || target.password || !['https:', 'http:'].includes(target.protocol)) {
    return Promise.reject(new Error('Invalid provider URL'))
  }
  return fetch(target, { ...init, redirect: 'error', signal: init.signal ?? AbortSignal.timeout(180_000) })
}
