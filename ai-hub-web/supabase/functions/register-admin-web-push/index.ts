import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/http.ts'

const allowedEndpointHosts = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
])

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
  const { data: project, error: projectError } = await supabase.schema('core').from('projects')
    .select('id').eq('slug', 'ai_hub').maybeSingle()
  if (projectError || !project?.id) return json({ error: 'AI HUB project is unavailable.' }, 500)
  const { data: membership } = await supabase.schema('core').from('project_memberships')
    .select('role, status').eq('project_id', project.id).eq('user_id', caller.user.id).maybeSingle()
  if (membership?.status !== 'approved' || !['owner', 'admin'].includes(membership.role)) {
    return json({ error: 'AI HUB admin permission is required.' }, 403)
  }

  let body: { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON.' }, 400) }
  const endpoint = typeof body.subscription?.endpoint === 'string' ? body.subscription.endpoint : ''
  const p256dh = typeof body.subscription?.keys?.p256dh === 'string' ? body.subscription.keys.p256dh : ''
  const auth = typeof body.subscription?.keys?.auth === 'string' ? body.subscription.keys.auth : ''
  let endpointUrl: URL
  try { endpointUrl = new URL(endpoint) } catch { return json({ error: 'Invalid push endpoint.' }, 400) }
  if (endpointUrl.protocol !== 'https:' || !allowedEndpointHosts.has(endpointUrl.hostname) || endpoint.length > 4096) {
    return json({ error: 'Unsupported push endpoint.' }, 400)
  }
  if (!p256dh || p256dh.length > 256 || !auth || auth.length > 256) {
    return json({ error: 'Invalid push encryption keys.' }, 400)
  }

  const { error } = await supabase.schema('ai_hub').from('admin_web_push_subscriptions').upsert({
    user_id: caller.user.id,
    endpoint,
    p256dh,
    auth,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })
  if (error) return json({ error: 'Could not register this device.' }, 500)
  return new Response(JSON.stringify({ registered: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
})
