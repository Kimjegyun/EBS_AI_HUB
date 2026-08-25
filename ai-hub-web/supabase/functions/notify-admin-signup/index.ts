import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createApprovalToken } from '../_shared/approvalToken.ts'
import { corsHeaders, escapeHtml, json } from '../_shared/http.ts'

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

  const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL') ?? 'AI HUB <onboarding@resend.dev>'
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''

  if (!adminEmail) {
    return json({ sent: false, reason: 'ADMIN_NOTIFICATION_EMAIL is not configured.' })
  }
  if (!resendApiKey) {
    return json({ sent: false, reason: 'RESEND_API_KEY is not configured.' })
  }
  if (!supabaseUrl || !supabaseServiceKey || !authHeader.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.slice('Bearer '.length).trim()
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const payload = (await req.json()) as SignupNotificationPayload
  if (payload.user_id !== userData.user.id) {
    return json({ error: 'Unauthorized' }, 401)
  }
  if (payload.status !== 'pending') {
    return json({ sent: false, reason: 'No approval is required.' })
  }

  let approveToken: string
  let rejectToken: string
  try {
    approveToken = await createApprovalToken(payload.user_id, 'approve')
    rejectToken = await createApprovalToken(payload.user_id, 'reject')
  } catch {
    return json({ sent: false, reason: 'APPROVAL_TOKEN_SECRET is not configured.' }, 500)
  }

  const baseUrl = supabaseUrl.replace('/rest/v1', '')
  const approveUrl = `${baseUrl}/functions/v1/approve-user?user_id=${encodeURIComponent(payload.user_id)}&action=approve&token=${encodeURIComponent(approveToken)}`
  const rejectUrl = `${baseUrl}/functions/v1/approve-user?user_id=${encodeURIComponent(payload.user_id)}&action=reject&token=${encodeURIComponent(rejectToken)}`

  const email = escapeHtml(payload.email ?? '-')
  const displayName = escapeHtml(payload.display_name ?? '-')
  const role = escapeHtml(payload.role ?? '-')
  const organization = escapeHtml(payload.organization ?? '-')
  const subject = `[AI HUB] 신규 사용자 승인 요청: ${payload.email ?? 'unknown'}`
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
          <p>이메일 확인을 완료한 사용자가 승인을 기다리고 있습니다.</p>
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

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: adminEmail,
      subject,
      html: htmlBody,
    }),
  })

  if (!res.ok) {
    return json({ sent: false, error: await res.text() }, 502)
  }

  return json({ sent: true })
})
