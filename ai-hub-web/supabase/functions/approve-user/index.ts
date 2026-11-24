import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyApprovalToken } from '../_shared/approvalToken.ts'
import { corsHeaders, escapeHtml, html, json } from '../_shared/http.ts'
import { adminApprovalEmail, sendAdminNotification } from '../_shared/adminNotifications.ts'

type ApprovalPayload = {
  user_id: string
  action: 'approve' | 'reject'
  token: string
}

async function notifyAdministratorsAfterApproval(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  approvedAt: string,
  approvedBy: string | null,
) {
  const { data: profile } = await supabase.schema('core').from('profiles')
    .select('email, display_name').eq('user_id', userId).maybeSingle()
  const { data: account } = await supabase.auth.admin.getUserById(userId)
  const { data: approver } = approvedBy
    ? await supabase.schema('core').from('profiles').select('display_name, email').eq('user_id', approvedBy).maybeSingle()
    : { data: null }
  return await sendAdminNotification(supabase, adminApprovalEmail({
    userId,
    email: profile?.email ?? account.user?.email ?? '',
    displayName: profile?.display_name ?? String(account.user?.user_metadata?.display_name ?? ''),
    organization: String(account.user?.user_metadata?.headquarters ?? ''),
    approvedAt,
    approvedBy: approver?.display_name || approver?.email || '이메일 승인 링크',
  }))
}

async function updatePendingMembership(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  status: 'approved' | 'rejected',
) {
  const { data: project } = await supabase.schema('core').from('projects')
    .select('id').eq('slug', 'ai_hub').maybeSingle()
  if (!project?.id) throw new Error('AI HUB project is unavailable.')
  const update = status === 'approved'
    ? { status, role: 'user', approved_at: new Date().toISOString(), approved_by: null }
    : { status, approved_at: null, approved_by: null }
  const { data: updated, error } = await supabase.schema('core').from('project_memberships')
    .update(update).eq('project_id', project.id).eq('user_id', userId).eq('status', 'pending')
    .select('status, approved_at, approved_by').maybeSingle()
  if (error) throw error
  if (updated) return { ...updated, changed: true }
  const { data: current, error: currentError } = await supabase.schema('core').from('project_memberships')
    .select('status, approved_at, approved_by').eq('project_id', project.id).eq('user_id', userId).maybeSingle()
  if (currentError) throw currentError
  if (!current) throw new Error('AI HUB member was not found.')
  return { ...current, changed: false }
}

function invalidTokenPage() {
  return html(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>유효하지 않은 토큰</title>
      <style>
        body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
        .error { color: #dc2626; }
      </style>
    </head>
    <body>
      <h1 class="error">유효하지 않은 토큰</h1>
      <p>승인 링크가 만료되었거나 유효하지 않습니다.</p>
    </body>
    </html>
  `, 403)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL') ?? 'AI HUB <onboarding@resend.dev>'
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  if (req.method === 'GET') {
    const url = new URL(req.url)
    const userId = url.searchParams.get('user_id')
    const action = url.searchParams.get('action') as 'approve' | 'reject'
    const token = url.searchParams.get('token')

    if (!userId || (action !== 'approve' && action !== 'reject') || !token) {
      return html(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>잘못된 요청</title>
          <style>
            body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
            .error { color: #dc2626; }
          </style>
        </head>
        <body>
          <h1 class="error">잘못된 요청</h1>
          <p>승인 링크가 올바르지 않습니다.</p>
        </body>
        </html>
      `, 400)
    }

    const valid = await verifyApprovalToken(token, userId, action)
    if (!valid) return invalidTokenPage()

    const { data: userData, error: userError } = await supabase
      .schema('core').from('profiles')
      .select('email, display_name')
      .eq('user_id', userId)
      .single()

    if (userError || !userData) {
      return html(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>사용자를 찾을 수 없음</title>
          <style>
            body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
            .error { color: #dc2626; }
          </style>
        </head>
        <body>
          <h1 class="error">사용자를 찾을 수 없음</h1>
          <p>해당 사용자 정보를 찾을 수 없습니다.</p>
        </body>
        </html>
      `, 404)
    }

    let membership: Awaited<ReturnType<typeof updatePendingMembership>>
    try {
      membership = await updatePendingMembership(supabase, userId, action === 'approve' ? 'approved' : 'rejected')
    } catch (updateError) {
      return html(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>처리 실패</title>
          <style>
            body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
            .error { color: #dc2626; }
          </style>
        </head>
        <body>
          <h1 class="error">처리 실패</h1>
          <p>사용자 상태 업데이트 중 오류가 발생했습니다: ${escapeHtml(updateError instanceof Error ? updateError.message : 'Unknown error')}</p>
        </body>
        </html>
      `, 500)
    }

    const safeName = escapeHtml(String(userData.display_name ?? ''))
    const safeEmail = escapeHtml(String(userData.email ?? ''))
    const alreadyApproved = action === 'approve' && membership.status === 'approved' && !membership.changed
    const requestedStatus = action === 'approve' ? 'approved' : 'rejected'
    if (!membership.changed && membership.status !== requestedStatus) {
      const currentLabel = membership.status === 'approved' ? '이미 승인된 사용자입니다.' : '이미 처리된 요청입니다.'
      return html(`<!doctype html><html lang="ko"><head><meta charset="UTF-8"><title>이미 처리됨</title></head><body style="font-family:system-ui;max-width:600px;margin:50px auto;padding:20px"><h1>${currentLabel}</h1><p>${safeName} (${safeEmail})의 현재 상태는 ${escapeHtml(membership.status)}입니다. 다른 관리자가 먼저 처리했을 수 있습니다.</p></body></html>`, 409)
    }

    let mailWarning = ''
    if (resendApiKey && userData.email && membership.changed) {
      const subject = action === 'approve'
        ? '[AI HUB] 가입이 승인되었습니다'
        : '[AI HUB] 가입이 거절되었습니다'
      const userHtml = action === 'approve'
        ? `
          <h2>AI HUB 가입 승인</h2>
          <p>안녕하세요, ${safeName}님!</p>
          <p>AI HUB 가입이 승인되었습니다. 이제 로그인하여 서비스를 이용하실 수 있습니다.</p>
        `
        : `
          <h2>AI HUB 가입 거절</h2>
          <p>안녕하세요, ${safeName}님!</p>
          <p>죄송합니다. AI HUB 가입이 거절되었습니다.</p>
          <p>문의사항이 있으시면 관리자에게 연락해 주세요.</p>
        `

      const userMail = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: userData.email,
          subject,
          html: userHtml,
        }),
      })
      if (!userMail.ok) mailWarning = ' 가입자에게 승인 메일을 보내지 못했습니다.'
    }

    if (action === 'approve' && membership.status === 'approved' && membership.approved_at) {
      try {
        await notifyAdministratorsAfterApproval(supabase, userId, membership.approved_at, membership.approved_by)
      } catch {
        mailWarning += ' 관리자 완료 알림을 보내지 못했습니다.'
      }
    }

    const actionText = action === 'approve' ? '승인' : '거절'
    const heading = alreadyApproved ? '이미 승인된 사용자입니다' : `${actionText} 완료`
    return html(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${heading}</title>
        <style>
          body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
          .success { color: #16a34a; }
          .info { color: #2563eb; }
          .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 30px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1 class="success">${heading}</h1>
          <p class="info">사용자 <strong>${safeName}</strong> (${safeEmail})은 ${alreadyApproved ? '다른 관리자가 이미 승인했습니다.' : `가입이 ${actionText}되었습니다.`}</p>
          ${mailWarning ? `<p>${escapeHtml(mailWarning.trim())}</p>` : ''}
        </div>
      </body>
      </html>
    `)
  }

  if (req.method === 'POST') {
    const payload = (await req.json()) as ApprovalPayload
    if (!payload.user_id || (payload.action !== 'approve' && payload.action !== 'reject') || !payload.token) {
      return json({ error: 'Missing required fields' }, 400)
    }
    const valid = await verifyApprovalToken(payload.token, payload.user_id, payload.action)
    if (!valid) {
      return json({ error: 'Invalid token' }, 403)
    }

    try {
      const membership = await updatePendingMembership(supabase, payload.user_id, payload.action === 'approve' ? 'approved' : 'rejected')
      const requestedStatus = payload.action === 'approve' ? 'approved' : 'rejected'
      if (!membership.changed && membership.status !== requestedStatus) {
        return json({ error: 'The membership was already processed.', status: membership.status }, 409)
      }
      if (payload.action === 'approve' && membership.status === 'approved' && membership.approved_at) {
        await notifyAdministratorsAfterApproval(supabase, payload.user_id, membership.approved_at, membership.approved_by)
      }
      if (payload.action === 'approve' && membership.status === 'approved' && membership.changed && resendApiKey) {
        const { data: profile } = await supabase.schema('core').from('profiles')
          .select('email, display_name').eq('user_id', payload.user_id).maybeSingle()
        if (profile?.email) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: fromEmail, to: profile.email, subject: '[AI HUB] 가입이 승인되었습니다', html: `<h2>AI HUB 가입 승인</h2><p>안녕하세요, ${escapeHtml(profile.display_name ?? '')}님.</p><p>AI HUB 가입이 승인되었습니다. 이제 로그인하여 서비스를 이용하실 수 있습니다.</p>` }),
          })
        }
      }
      return json({ success: true, status: membership.status, alreadyApproved: payload.action === 'approve' && membership.status === 'approved' && !membership.changed })
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Approval failed.' }, 500)
    }
  }

  return json({ error: 'Method not allowed' }, 405)
})
