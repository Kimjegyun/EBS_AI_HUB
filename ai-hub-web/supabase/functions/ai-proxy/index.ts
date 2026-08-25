import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/http.ts'
import { completeWithProviderConfig, type ChatMessage } from '../_shared/providerComplete.ts'
import { resolveProviderConfig } from '../_shared/appAiConfig.ts'
import { completeTencent } from '../_shared/tencentComplete.ts'

type ProxyBody = {
  provider?: string
  messages?: ChatMessage[]
  model?: string
  endpoint?: string
  appId?: string
  skipUsageCheck?: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !authHeader) {
    return json({ ok: false, error: 'Unauthorized' }, 401)
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) {
    return json({ ok: false, error: 'Unauthorized' }, 401)
  }

  const { data: sessionData, error: sessionError } = await userClient.rpc('ai_hub_get_session_v2')
  const session = sessionData && typeof sessionData === 'object'
    ? sessionData as { status?: string; role?: string }
    : null
  if (sessionError || session?.status !== 'approved') {
    return json({ ok: false, error: '승인된 사용자만 AI를 사용할 수 있습니다.' }, 403)
  }

  let body: ProxyBody
  try {
    const parsed = await req.json()
    const source =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
    const nested =
      source.body && typeof source.body === 'object' && !Array.isArray(source.body)
        ? source.body as Record<string, unknown>
        : source
    body = nested as ProxyBody
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400)
  }

  const provider =
    body.provider === 'fal'
      ? 'fal'
      : body.provider === 'tencent'
        ? 'tencent'
        : body.provider === 'openai'
          ? 'openai'
          : null
  if (!provider || !Array.isArray(body.messages)) {
    return json({ ok: false, error: 'provider와 messages가 필요합니다.' }, 400)
  }

  const isAdmin = session.role === 'admin' || session.role === 'owner'
  if (!(body.skipUsageCheck === true && isAdmin)) {
    const { data: usageData, error: usageError } = await userClient.rpc('ai_hub_consume_api_usage_v1', {
      p_units: 1,
    })
    if (usageError) {
      return json({ ok: false, error: usageError.message }, 400)
    }
    const usage = usageData && typeof usageData === 'object' ? usageData as { ok?: unknown; error?: unknown } : {}
    if (usage.ok === false) {
      return json({ ok: false, error: String(usage.error ?? 'API 사용 한도를 초과했습니다.') }, 429)
    }
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey)
  const { data: providerConfig, error: configError } = await adminClient.rpc('ai_hub_proxy_get_provider_config')
  if (configError) {
    return json({ ok: false, error: 'AI 설정을 불러오지 못했습니다.' }, 500)
  }
  const config = resolveProviderConfig(
    providerConfig && typeof providerConfig === 'object' && !Array.isArray(providerConfig)
      ? providerConfig as Record<string, unknown>
      : {},
    typeof body.appId === 'string' ? body.appId : undefined,
  )

  const result = provider === 'tencent'
    ? await completeTencent({
        messages: body.messages,
        config,
        model: body.model,
        apiUrl: body.endpoint,
      })
    : await completeWithProviderConfig(
        {
          provider,
          messages: body.messages,
          model: body.model,
          endpoint: body.endpoint,
        },
        config,
      )
  return json(result)
})
