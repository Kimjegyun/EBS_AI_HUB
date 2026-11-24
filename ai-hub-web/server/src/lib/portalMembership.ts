import { createHash } from 'node:crypto'

type Result = {
  status: number
  body: { approved: boolean; userId?: string; role?: string; error?: string }
}
const failure = (status: number, error: string): Result => ({ status, body: { approved: false, error } })
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
// Coalesce concurrent verification only. Never cache a completed approval decision.
const pendingByRequest = new WeakMap<typeof fetch, Map<string, Promise<Result>>>()

async function verify(base: string, key: string, token: string, request: typeof fetch): Promise<Result> {
  const controller = new AbortController()
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)])
  try {
    const url = new URL(base)
    if (!key || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
      return failure(503, 'Portal authentication is not configured.')
    }
    const headers = { apikey: key, Authorization: `Bearer ${token}` }
    const read = async (path: string, init: RequestInit) => {
      const response = await request(new URL(path, url), { ...init, redirect: 'error', signal })
      if (!response.ok) { void response.body?.cancel().catch(() => {}); return {status: response.status, body: null} }
      return {status: response.status, body: await response.json() as unknown}
    }
    // Both are reads authenticated by the same token. Identity AND approval must match.
    const userRead = read('/auth/v1/user', { headers })
    const memberRead = read('/rest/v1/rpc/ai_hub_get_session_v2', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}',
    }).then(value => ({value}), () => ({value: null}))
    const userResponse = await userRead
    if (userResponse.status < 200 || userResponse.status >= 300) {
      return [401, 403].includes(userResponse.status)
        ? failure(401, 'Authentication required.')
        : failure(503, 'Authentication verification is temporarily unavailable.')
    }
    const user = userResponse.body
    if (!record(user) || typeof user.id !== 'string' || !user.id.trim()) return failure(503, 'Authenticated user identity is unavailable.')
    const memberResponse = (await memberRead).value
    if (!memberResponse) return failure(503, 'Membership verification is temporarily unavailable.')
    if (memberResponse.status < 200 || memberResponse.status >= 300) {
      return memberResponse.status === 401 ? failure(401, 'Authentication required.') : failure(503, 'Membership verification is temporarily unavailable.')
    }
    const member: unknown = Array.isArray(memberResponse.body) ? memberResponse.body[0] : memberResponse.body
    if (!record(member) || member.user_id !== user.id || member.status !== 'approved') return failure(403, 'Approved membership for this account is required.')
    return { status: 200, body: { approved: true, userId: user.id, role: typeof member.role === 'string' ? member.role : 'user' } }
  } catch {
    return failure(503, 'Membership verification is temporarily unavailable.')
  } finally { controller.abort() }
}

/** Provider outages must not revoke a valid login or become approval decisions. */
export async function verifyPortalMembership(base: string, key: string, token: string, request: typeof fetch = fetch): Promise<Result> {
  if (!token) return failure(401, 'Authentication required.')
  let pending = pendingByRequest.get(request)
  if (!pending) { pending = new Map(); pendingByRequest.set(request, pending) }
  const id = createHash('sha256').update(JSON.stringify([base, key, token])).digest('hex')
  const active = pending.get(id)
  if (active) return active
  const work = verify(base, key, token, request)
  // Bounded bookkeeping; overflow still verifies, without sharing its result.
  if (pending.size < 500) pending.set(id, work)
  try { return await work }
  finally { if (pending.get(id) === work) pending.delete(id) }
}
