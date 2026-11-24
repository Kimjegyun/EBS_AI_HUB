import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { escapeHtml } from './http.ts'

type SupabaseAdminClient = ReturnType<typeof createClient>

type AdminNotification = {
  eventKey: string
  subject: string
  html: string
}

export async function getAiHubAdminRecipients(supabase: SupabaseAdminClient): Promise<string[]> {
  const { data: project, error: projectError } = await supabase.schema('core').from('projects')
    .select('id').eq('slug', 'ai_hub').maybeSingle()
  if (projectError || !project?.id) throw new Error('AI HUB project is unavailable.')

  const { data: memberships, error: membershipError } = await supabase.schema('core').from('project_memberships')
    .select('user_id').eq('project_id', project.id).eq('status', 'approved').in('role', ['owner', 'admin'])
  if (membershipError) throw new Error('Could not load approved AI HUB administrators.')

  const userIds = [...new Set((memberships ?? []).map((member) => String(member.user_id)).filter(Boolean))]
  let recipients: string[] = []
  if (userIds.length) {
    const { data: profiles, error: profileError } = await supabase.schema('core').from('profiles')
      .select('email').in('user_id', userIds)
    if (profileError) throw new Error('Could not load administrator email addresses.')
    recipients = (profiles ?? []).map((profile) => String(profile.email ?? '').trim().toLowerCase())
  }

  // Keep the configured mailbox as a bootstrap fallback for a fresh install that has
  // not created its first approved owner yet. Once admins exist, only they are notified.
  if (!recipients.length) {
    const fallback = Deno.env.get('ADMIN_NOTIFICATION_EMAIL')?.trim().toLowerCase()
    if (fallback) recipients = [fallback]
  }
  return [...new Set(recipients.filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))].sort()
}

export async function sendAdminNotification(
  supabase: SupabaseAdminClient,
  notification: AdminNotification,
): Promise<{ sent: number; skipped: number }> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured.')
  const from = Deno.env.get('FROM_EMAIL') ?? 'AI HUB <onboarding@resend.dev>'
  const recipients = await getAiHubAdminRecipients(supabase)
  if (!recipients.length) throw new Error('No approved AI HUB administrators have a notification email.')

  let sent = 0
  let skipped = 0
  const failures: string[] = []
  for (const recipient of recipients) {
    const { error: claimError } = await supabase.schema('ai_hub').from('admin_email_notification_log')
      .insert({ event_key: notification.eventKey, recipient_email: recipient })
    if (claimError?.code === '23505') {
      skipped += 1
      continue
    }
    if (claimError) {
      failures.push(`${recipient}: could not record delivery`)
      continue
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: recipient, subject: notification.subject, html: notification.html }),
      })
      if (!response.ok) throw new Error(await response.text())
      sent += 1
    } catch (error) {
      await supabase.schema('ai_hub').from('admin_email_notification_log').delete()
        .eq('event_key', notification.eventKey).eq('recipient_email', recipient)
      failures.push(`${recipient}: ${error instanceof Error ? error.message : 'mail delivery failed'}`)
    }
  }
  if (failures.length) throw new Error(`Some administrator notifications failed: ${failures.join('; ')}`)
  return { sent, skipped }
}

export function adminApprovalEmail(input: {
  userId: string
  email: string
  displayName: string
  organization: string
  approvedAt: string
  approvedBy: string
}) {
  const email = escapeHtml(input.email || '-')
  const displayName = escapeHtml(input.displayName || '-')
  const organization = escapeHtml(input.organization || '-')
  const approvedAt = escapeHtml(input.approvedAt || '-')
  const approvedBy = escapeHtml(input.approvedBy || '승인 링크')
  return {
    eventKey: `membership-approved:${input.userId}:${input.approvedAt}`,
    subject: `[AI HUB] 가입 승인 처리 완료: ${input.email || '-'}`,
    html: `<!doctype html><html lang="ko"><head><meta charset="UTF-8"></head><body style="font-family:system-ui,sans-serif;line-height:1.6;color:#222"><main style="max-width:600px;margin:auto;padding:24px"><h2>AI HUB 가입 승인 처리 완료</h2><p>가입 대기 사용자의 승인이 완료되었습니다.</p><table style="border-collapse:collapse"><tr><th align="left" style="padding:6px">이메일</th><td style="padding:6px">${email}</td></tr><tr><th align="left" style="padding:6px">이름</th><td style="padding:6px">${displayName}</td></tr><tr><th align="left" style="padding:6px">소속</th><td style="padding:6px">${organization}</td></tr><tr><th align="left" style="padding:6px">처리자</th><td style="padding:6px">${approvedBy}</td></tr><tr><th align="left" style="padding:6px">처리 시각</th><td style="padding:6px">${approvedAt}</td></tr></table><p>이미 승인된 사용자에 대해 다른 관리자가 다시 승인하면 추가 승인 메일을 보내지 않고, 관리자 화면에 이미 승인된 상태로 표시합니다.</p></main></body></html>`,
  }
}
