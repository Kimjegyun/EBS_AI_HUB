import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type SupabaseAdminClient = ReturnType<typeof createClient>

export async function sendAdminSignupPush(
  supabase: SupabaseAdminClient,
  userId: string,
): Promise<{ sent: number; skipped: number; failed: number; configured: boolean }> {
  const publicKey = Deno.env.get('WEB_PUSH_PUBLIC_KEY')?.trim() ?? ''
  const privateKey = Deno.env.get('WEB_PUSH_PRIVATE_KEY')?.trim() ?? ''
  const subject = Deno.env.get('WEB_PUSH_CONTACT')?.trim() || 'https://ebs-aihub.com/'
  if (!publicKey || !privateKey) return { sent: 0, skipped: 0, failed: 0, configured: false }
  const webPushModule = await import('npm:web-push@3.6.7')
  const webPush = webPushModule.default ?? webPushModule

  const { data: project, error: projectError } = await supabase.schema('core').from('projects')
    .select('id').eq('slug', 'ai_hub').maybeSingle()
  if (projectError || !project?.id) throw new Error('AI HUB project is unavailable.')
  const { data: admins, error: adminError } = await supabase.schema('core').from('project_memberships')
    .select('user_id').eq('project_id', project.id).eq('status', 'approved').in('role', ['owner', 'admin'])
  if (adminError) throw new Error('Could not load AI HUB administrators.')
  const adminIds = [...new Set((admins ?? []).map((row) => String(row.user_id)).filter(Boolean))]
  if (!adminIds.length) return { sent: 0, skipped: 0, failed: 0, configured: true }

  const { data: subscriptions, error: subscriptionError } = await supabase.schema('ai_hub')
    .from('admin_web_push_subscriptions').select('id, endpoint, p256dh, auth')
    .in('user_id', adminIds)
  if (subscriptionError) throw new Error('Could not load administrator push subscriptions.')
  if (!subscriptions?.length) return { sent: 0, skipped: 0, failed: 0, configured: true }

  webPush.setVapidDetails(subject, publicKey, privateKey)
  let sent = 0
  let skipped = 0
  let failed = 0
  for (const subscription of subscriptions) {
    const eventKey = `signup-pending:${userId}`
    const { error: claimError } = await supabase.schema('ai_hub').from('admin_web_push_delivery_log')
      .insert({ event_key: eventKey, subscription_id: subscription.id })
    if (claimError?.code === '23505') {
      skipped += 1
      continue
    }
    if (claimError) throw new Error('Could not record push delivery.')

    try {
      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify({
        title: 'AI HUB 가입 승인 요청',
        body: '새 가입 신청이 도착했습니다. 앱에서 확인해 주세요.',
        url: 'approvals/app.html',
      }), { TTL: 300, urgency: 'high' })
      sent += 1
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode ?? 0)
      if (statusCode === 404 || statusCode === 410) {
        await supabase.schema('ai_hub').from('admin_web_push_subscriptions').delete().eq('id', subscription.id)
      } else {
        failed += 1
        await supabase.schema('ai_hub').from('admin_web_push_delivery_log').delete()
          .eq('event_key', eventKey).eq('subscription_id', subscription.id)
      }
    }
  }
  return { sent, skipped, failed, configured: true }
}
