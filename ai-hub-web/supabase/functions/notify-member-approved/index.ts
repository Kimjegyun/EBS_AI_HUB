import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, escapeHtml, json } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('FROM_EMAIL') ?? 'AI HUB <onboarding@resend.dev>'
  const authorization = req.headers.get('Authorization') ?? ''
  if (!supabaseUrl || !serviceKey || !authorization.startsWith('Bearer ')) return json({ error: 'Unauthorized.' }, 401)

  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: caller, error: authError } = await supabase.auth.getUser(authorization.slice(7).trim())
  if (authError || !caller.user) return json({ error: 'Unauthorized.' }, 401)
  const { data: project } = await supabase.schema('core').from('projects').select('id').eq('slug', 'ai_hub').single()
  const { data: callerMembership } = await supabase.schema('core').from('project_memberships')
    .select('role, status').eq('project_id', project?.id ?? '').eq('user_id', caller.user.id).maybeSingle()
  if (callerMembership?.status !== 'approved' || !['owner', 'admin'].includes(callerMembership.role)) {
    return json({ error: 'AI HUB admin permission is required.' }, 403)
  }

  const { user_id: userId } = await req.json() as { user_id?: string }
  if (!userId) return json({ error: 'Missing user_id.' }, 400)
  const { data: membership } = await supabase.schema('core').from('project_memberships')
    .select('status').eq('project_id', project?.id ?? '').eq('user_id', userId).maybeSingle()
  if (membership?.status !== 'approved') return json({ error: 'User is not approved.' }, 409)

  const { data: profile } = await supabase.schema('core').from('profiles')
    .select('email, display_name').eq('user_id', userId).maybeSingle()
  if (!profile?.email || !apiKey) return json({ error: 'Mail service or user email is unavailable.' }, 503)
  const safeName = escapeHtml(profile.display_name ?? '')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: profile.email,
      subject: '[AI HUB] 가입이 승인되었습니다',
      html: `<h2>AI HUB 가입 승인</h2><p>안녕하세요, ${safeName}님.</p><p>AI HUB 가입이 승인되었습니다. 이제 로그인하여 서비스를 이용하실 수 있습니다.</p>`,
    }),
  })
  if (!response.ok) return json({ error: 'Approval email could not be delivered.' }, 502)
  return json({ sent: true })
})
