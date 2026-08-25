import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyApprovalToken } from '../_shared/approvalToken.ts'
import { corsHeaders, escapeHtml, html, json } from '../_shared/http.ts'

type ApprovalPayload = {
  user_id: string
  action: 'approve' | 'reject'
  token: string
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
      .from('core.profiles')
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

    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    const { error: updateError } = await supabase.rpc('ai_hub_update_member_v2', {
      p_user_id: userId,
      p_status: newStatus,
      p_role: 'user',
    })

    if (updateError) {
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
          <p>사용자 상태 업데이트 중 오류가 발생했습니다: ${escapeHtml(updateError.message)}</p>
        </body>
        </html>
      `, 500)
    }

    const safeName = escapeHtml(String(userData.display_name ?? ''))
    const safeEmail = escapeHtml(String(userData.email ?? ''))

    if (resendApiKey && userData.email) {
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

      await fetch('https://api.resend.com/emails', {
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
    }

    const actionText = action === 'approve' ? '승인' : '거절'
    return html(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${actionText} 완료</title>
        <style>
          body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
          .success { color: #16a34a; }
          .info { color: #2563eb; }
          .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 30px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1 class="success">${actionText} 완료</h1>
          <p class="info">사용자 <strong>${safeName}</strong> (${safeEmail})의 가입이 ${actionText}되었습니다.</p>
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

    const newStatus = payload.action === 'approve' ? 'approved' : 'rejected'
    const { error } = await supabase.rpc('ai_hub_update_member_v2', {
      p_user_id: payload.user_id,
      p_status: newStatus,
      p_role: 'user',
    })
    if (error) {
      return json({ error: error.message }, 500)
    }
    return json({ success: true, status: newStatus })
  }

  return json({ error: 'Method not allowed' }, 405)
})
