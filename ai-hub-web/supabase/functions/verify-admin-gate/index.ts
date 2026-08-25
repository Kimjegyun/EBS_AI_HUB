import { corsHeaders, json } from '../_shared/http.ts'
import { timingSafeEqualString } from '../_shared/timingSafe.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed.' }, 405)
  }

  const expected = Deno.env.get('ADMIN_ACCESS_CODE')?.trim() ?? ''
  if (!expected) {
    return json({ ok: false, error: 'ADMIN_ACCESS_CODE is not configured.' }, 503)
  }

  let code = ''
  try {
    const body = await req.json() as { code?: unknown }
    code = typeof body.code === 'string' ? body.code.trim() : ''
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400)
  }
  if (!code) {
    return json({ ok: false, error: 'code is required.' }, 400)
  }

  return json({ ok: await timingSafeEqualString(expected, code) })
})
