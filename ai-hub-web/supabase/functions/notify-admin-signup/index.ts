import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createApprovalToken } from '../_shared/approvalToken.ts'
import { sendAdminSignupPush } from '../_shared/adminWebPush.ts'
import { corsHeaders, escapeHtml, json } from '../_shared/http.ts'
import { sendAdminNotification } from '../_shared/adminNotifications.ts'

type SignupNotificationPayload = {
  user_id?: string
  project_id?: string
  email?: string
  display_name?: string
  organization?: string | null
  role?: string
  status?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const payload = (await req.json()) as SignupNotificationPayload
  if (!payload.user_id) return json({ error: 'Missing user_id.' }, 400)

  const { data: accountData, error: accountError } = await supabase.auth.admin.getUserById(payload.user_id)
  if (accountError || !accountData.user) return json({ error: 'User not found.' }, 404)
  const account = accountData.user

  // Authenticated pending users may request a reminder. During email confirmation,
  // the client has no session, so permit only a newly created pending account.
  if (authHeader.startsWith('Bearer ')) {
    const { data: callerData, error: callerError } = await supabase.auth.getUser(authHeader.slice(7).trim())
    if (!callerError && callerData.user && callerData.user.id !== account.id) return json({ error: 'Unauthorized' }, 401)
    if (callerError || !callerData.user) {
      const createdAt = Date.parse(account.created_at ?? '')
      if (!Number.isFinite(createdAt) || Date.now() - createdAt > 24 * 60 * 60 * 1000) {
        return json({ error: 'A recent signup is required.' }, 401)
      }
    }
  } else {
    const createdAt = Date.parse(account.created_at ?? '')
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > 24 * 60 * 60 * 1000) {
      return json({ error: 'A recent signup is required.' }, 401)
    }
  }

  const { data: project } = await supabase.schema('core').from('projects')
    .select('id').eq('slug', 'ai_hub').maybeSingle()
  const { data: member, error: memberError } = await supabase
    .schema('core').from('project_memberships').select('status, role')
    .eq('user_id', account.id).eq('project_id', project?.id ?? '').maybeSingle()
  if (memberError || !member || member.status !== 'pending') {
    return json({ sent: false, reason: 'No approval is required.' })
  }
  let approveToken: string
  let rejectToken: string
  try {
    approveToken = await createApprovalToken(account.id, 'approve')
    rejectToken = await createApprovalToken(account.id, 'reject')
  } catch {
    return json({ sent: false, reason: 'APPROVAL_TOKEN_SECRET is not configured.' }, 500)
  }
  const baseUrl = supabaseUrl.replace('/rest/v1', '')
  const approveUrl = `${baseUrl}/functions/v1/approve-user?user_id=${encodeURIComponent(account.id)}&action=approve&token=${encodeURIComponent(approveToken)}`
  const rejectUrl = `${baseUrl}/functions/v1/approve-user?user_id=${encodeURIComponent(account.id)}&action=reject&token=${encodeURIComponent(rejectToken)}`

  const { data: profile } = await supabase.schema('core').from('profiles')
    .select('email, display_name').eq('user_id', account.id).maybeSingle()
  const email = escapeHtml(profile?.email ?? account.email ?? '-')
  const displayName = escapeHtml(profile?.display_name ?? String(account.user_metadata?.display_name ?? '-'))
  const role = escapeHtml(member.role ?? 'user')
  const organization = escapeHtml(String(account.user_metadata?.headquarters ?? '-'))
  const subject = `[AI HUB] 가입 승인 대기: ${profile?.email ?? account.email ?? 'unknown'}`
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4f46e5; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .info-table td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
        .info-table td:first-child { font-weight: 600; width: 120px; }
        .button-container { margin: 30px 0; text-align: center; }
        .button { display: inline-block; padding: 12px 30px; margin: 0 10px; text-decoration: none; border-radius: 6px; font-weight: 600; }
        .approve { background: #16a34a; color: white; }
        .reject { background: #dc2626; color: white; }
        .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0;">AI HUB 신규 사용자 승인 요청</h2>
        </div>
        <div class="content">
          <p>가입 신청한 사용자가 이메일 인증과 관리자 승인을 기다리고 있습니다.</p>
          <table class="info-table">
            <tr><td>이메일</td><td>${email}</td></tr>
            <tr><td>이름</td><td>${displayName}</td></tr>
            <tr><td>역할</td><td>${role}</td></tr>
            <tr><td>조직</td><td>${organization}</td></tr>
          </table>
          <div class="button-container">
            <a href="${approveUrl}" class="button approve">승인</a>
            <a href="${rejectUrl}" class="button reject">거절</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">
            또는 AI HUB 관리자 화면의 Users 페이지에서 직접 승인/거절할 수 있습니다.
          </p>
        </div>
        <div class="footer">
          <p>이 이메일은 AI HUB 시스템에서 자동으로 발송되었습니다.</p>
        </div>
      </div>
    </body>
    </html>
  `

  let delivery: { sent: number; skipped: number } = { sent: 0, skipped: 0 }
  let emailError = ''
  try {
    delivery = await sendAdminNotification(supabase, {
      eventKey: `signup-pending:${account.id}`,
      subject,
      html: htmlBody,
    })
  } catch (error) {
    emailError = error instanceof Error ? error.message : 'Admin notification failed.'
  }
  let push: { sent: number; skipped: number; failed: number; configured: boolean } = { sent: 0, skipped: 0, failed: 0, configured: false }
  try {
    push = await sendAdminSignupPush(supabase, account.id)
  } catch (error) {
    console.error('Admin Web Push delivery failed:', error instanceof Error ? error.message : 'unknown error')
  }
  if (emailError) return json({ sent: false, error: emailError, push }, 502)
  return json({ sent: true, ...delivery, push })
})
