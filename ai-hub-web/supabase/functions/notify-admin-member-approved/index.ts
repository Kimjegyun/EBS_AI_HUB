import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { adminApprovalEmail, sendAdminNotification } from '../_shared/adminNotifications.ts'
import { corsHeaders, json } from '../_shared/http.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authorization = req.headers.get('Authorization') ?? ''
  if (!supabaseUrl || !serviceKey || !authorization.startsWith('Bearer ')) return json({ error: 'Unauthorized.' }, 401)

  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: caller, error: authError } = await supabase.auth.getUser(authorization.slice(7).trim())
  if (authError || !caller.user) return json({ error: 'Unauthorized.' }, 401)

  const { data: project, error: projectError } = await supabase.schema('core').from('projects')
    .select('id').eq('slug', 'ai_hub').maybeSingle()
  if (projectError || !project?.id) return json({ error: 'AI HUB project is unavailable.' }, 500)
  const { data: callerMembership } = await supabase.schema('core').from('project_memberships')
    .select('role, status').eq('project_id', project.id).eq('user_id', caller.user.id).maybeSingle()
  if (callerMembership?.status !== 'approved' || !['owner', 'admin'].includes(callerMembership.role)) {
    return json({ error: 'AI HUB admin permission is required.' }, 403)
  }

  const { user_id: userId } = await req.json() as { user_id?: string }
  if (!userId) return json({ error: 'Missing user_id.' }, 400)
  const { data: member } = await supabase.schema('core').from('project_memberships')
    .select('status, approved_at, approved_by').eq('project_id', project.id).eq('user_id', userId).maybeSingle()
  if (member?.status !== 'approved' || !member.approved_at) return json({ error: 'User is not approved.' }, 409)

  const { data: profile } = await supabase.schema('core').from('profiles')
    .select('email, display_name').eq('user_id', userId).maybeSingle()
  if (!profile?.email) return json({ error: 'Approved member email is unavailable.' }, 404)
  const { data: account } = await supabase.auth.admin.getUserById(userId)
  const { data: adminProfile } = member.approved_by
    ? await supabase.schema('core').from('profiles').select('display_name, email').eq('user_id', member.approved_by).maybeSingle()
    : { data: null }

  try {
    const result = await sendAdminNotification(supabase, adminApprovalEmail({
      userId,
      email: profile.email,
      displayName: profile.display_name ?? '',
      organization: String(account.user?.user_metadata?.headquarters ?? ''),
      approvedAt: member.approved_at,
      approvedBy: adminProfile?.display_name || adminProfile?.email || '이메일 승인 링크',
    }))
    return json({ sent: true, ...result })
  } catch (error) {
    return json({ sent: false, error: error instanceof Error ? error.message : 'Admin notification failed.' }, 502)
  }
})
