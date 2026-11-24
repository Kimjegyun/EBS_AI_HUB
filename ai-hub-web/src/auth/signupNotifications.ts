import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import type { AuthSession } from './types'

const NOTIFY_ADMIN_TIMEOUT_MS = 10_000

export async function notifyAdminForUnconfirmedSignup(userId: string): Promise<void> {
  if (!supabase) return
  try {
    await withTimeout(
      Promise.resolve(supabase.functions.invoke('notify-admin-signup', {
        body: { user_id: userId },
      })),
      NOTIFY_ADMIN_TIMEOUT_MS,
      '관리자 알림 메일 발송이 지연되고 있습니다.',
    )
  } catch {
    // Email confirmation must remain available even when the mail provider is down.
  }
}

export async function notifyAdminSignupApprovalNeeded(session: AuthSession): Promise<void> {
  if (!supabase || session.status !== 'pending') return

  try {
    await withTimeout(
      Promise.resolve(
        supabase.functions.invoke('notify-admin-signup', {
          body: {
            user_id: session.userId,
            project_id: session.projectId,
            email: session.email,
            display_name: session.displayName,
            organization: session.organization,
            role: session.projectRole ?? session.role,
            status: session.status,
          },
        }),
      ),
      NOTIFY_ADMIN_TIMEOUT_MS,
      '관리자 승인 요청 메일 발송이 지연되고 있습니다.',
    )
  } catch {
    // Signup must not fail only because notification email delivery failed.
  }
}
