import { corsHeaders, json } from '../_shared/http.ts'
import { timingSafeEqualString } from '../_shared/timingSafe.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

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

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: 'Rate limiter is not configured.' }, 503)

  // Supabase's gateway supplies x-forwarded-for. Use only its client address and
  // store a keyed digest, never the raw address, in the rate-limit table.
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
  if (!forwardedFor) return json({ ok: false, error: 'Client address is unavailable.' }, 503)
  const ipHash = await hmacHex(serviceKey, forwardedFor)
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: rate, error: rateError } = await supabase.rpc('ai_hub_consume_admin_gate_attempt_v1', {
    p_ip_hash: ipHash,
  })
  if (rateError || !rate) return json({ ok: false, error: 'Rate limiter is unavailable.' }, 503)
  if (rate.allowed !== true) {
    return new Response(JSON.stringify({ ok: false, error: 'Too many attempts. Try again later.' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(rate.retry_after_seconds ?? 900) },
    })
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
