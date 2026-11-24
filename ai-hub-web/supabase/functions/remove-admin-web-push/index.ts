import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authorization = req.headers.get('Authorization') ?? ''
  const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1]
  if (!url || !serviceKey || !token) return json({ error: 'Unauthorized.' }, 401)

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: caller, error: authError } = await supabase.auth.getUser(token)
  if (authError || !caller.user) return json({ error: 'Unauthorized.' }, 401)
  let body: { endpoint?: unknown }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON.' }, 400) }
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
  if (!endpoint || endpoint.length > 4096) return json({ error: 'Invalid push endpoint.' }, 400)

  const { error } = await supabase.schema('ai_hub').from('admin_web_push_subscriptions').delete()
    .eq('user_id', caller.user.id).eq('endpoint', endpoint)
  if (error) return json({ error: 'Could not remove this device.' }, 500)
  return new Response(JSON.stringify({ removed: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
})
