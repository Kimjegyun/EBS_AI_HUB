import { useEffect, useState, type FormEvent } from 'react'
import { useEnvironmentConfig } from '../context/EnvironmentConfigContext'
import { saveEnvironmentConfig } from '../lib/environmentConfig'
import {
  clearRuntimeSupabaseConfig,
  getRuntimeSupabaseConfig,
  hasRuntimeSupabaseOverride,
  saveRuntimeSupabaseConfig,
} from '../lib/supabase'
import type { EnvironmentPublicConfig } from '../types/environment'
import { Icon } from './Icon'
import SupabaseConnectionGuide from './SupabaseConnectionGuide'

type Props = {
  open: boolean
  onClose: () => void
}

function emptyToUndefined(s: string): string | undefined {
  const t = s.trim()
  return t === '' ? undefined : t
}

function optionalUrl(s: string): string | undefined {
  const t = emptyToUndefined(s)
  if (!t) return undefined
  try {
    const u = new URL(t)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error('Only http(s) URLs are allowed.')
    }
    return u.href
  } catch {
    throw new Error('URL format is invalid.')
  }
}

export default function EnvironmentSettingsDialog({ open, onClose }: Props) {
  const { config, updatedAt, refetch, supabaseReady, loading, error: loadError } =
    useEnvironmentConfig()

  const [serviceDisplayName, setServiceDisplayName] = useState('')
  const [supportEmail, setSupportEmail] = useState('')
  const [publicApiBaseUrl, setPublicApiBaseUrl] = useState('')
  const [integrationsWebhookUrl, setIntegrationsWebhookUrl] = useState('')
  const [adminNotes, setAdminNotes] = useState('')
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('')
  const [runtimeOverride, setRuntimeOverride] = useState(false)
  const [needsReload, setNeedsReload] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)
  const [activePanel, setActivePanel] = useState<'settings' | 'guide'>('settings')

  useEffect(() => {
    if (!open) {
      setSavedOk(false)
      setFormError(null)
      setNeedsReload(false)
      return
    }

    const runtime = getRuntimeSupabaseConfig()
    setSupabaseUrl(runtime.url)
    setSupabaseAnonKey(runtime.anonKey)
    setRuntimeOverride(hasRuntimeSupabaseOverride())
    setServiceDisplayName(config.service_display_name ?? '')
    setSupportEmail(config.support_email ?? '')
    setPublicApiBaseUrl(config.public_api_base_url ?? '')
    setIntegrationsWebhookUrl(config.integrations_webhook_url ?? '')
    setAdminNotes(config.admin_notes ?? '')
    setActivePanel('settings')
  }, [open, config])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSavedOk(false)

    let normalizedSupabaseUrl = ''
    try {
      normalizedSupabaseUrl = optionalUrl(supabaseUrl) ?? ''
    } catch {
      setFormError('Supabase Project URL 형식이 올바르지 않습니다.')
      return
    }

    if (normalizedSupabaseUrl && !supabaseAnonKey.trim()) {
      setFormError('Supabase Anon Public Key를 입력해 주세요.')
      return
    }

    const currentRuntime = getRuntimeSupabaseConfig()
    const nextRuntime = {
      url: normalizedSupabaseUrl,
      anonKey: supabaseAnonKey.trim(),
    }
    const runtimeChanged =
      nextRuntime.url !== currentRuntime.url || nextRuntime.anonKey !== currentRuntime.anonKey

    let parsed: EnvironmentPublicConfig
    try {
      parsed = {
        service_display_name: emptyToUndefined(serviceDisplayName),
        support_email: emptyToUndefined(supportEmail),
        public_api_base_url: optionalUrl(publicApiBaseUrl),
        integrations_webhook_url: optionalUrl(integrationsWebhookUrl),
        admin_notes: emptyToUndefined(adminNotes),
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '입력값을 확인해 주세요.')
      return
    }

    setSaving(true)

    if (runtimeChanged) {
      if (nextRuntime.url && nextRuntime.anonKey) {
        saveRuntimeSupabaseConfig(nextRuntime)
        setRuntimeOverride(true)
      } else {
        clearRuntimeSupabaseConfig()
        setRuntimeOverride(false)
      }
      setNeedsReload(true)
    }

    if (!supabaseReady) {
      setSaving(false)
      setSavedOk(true)
      setFormError(
        runtimeChanged
          ? 'Supabase 설정을 저장했습니다. 새로고침 후 API 설정을 DB에 저장할 수 있습니다.'
          : 'Supabase를 먼저 설정하고 새로고침해 주세요.',
      )
      return
    }

    const { error } = await saveEnvironmentConfig(parsed)
    setSaving(false)

    if (error) {
      setFormError(error.message)
      return
    }

    setSavedOk(true)
    await refetch()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-inverse-surface/40 backdrop-blur-[2px]"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-settings-title"
        className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl border border-outline-variant bg-surface-container shadow-xl"
      >
        <div className="sticky top-0 z-10 border-b border-outline-variant bg-surface-container px-6 py-4">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Icon name="admin_panel_settings" className="text-primary text-[24px]" />
              <h2 id="admin-settings-title" className="font-h2 text-h2 text-on-surface">
                관리자 모드 설정
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high"
              aria-label="닫기"
            >
              <Icon name="close" />
            </button>
          </div>

          <div className="flex rounded-lg border border-outline-variant bg-surface-container-high p-1" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activePanel === 'settings'}
              onClick={() => setActivePanel('settings')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 font-h3 text-h3 transition-colors ${
                activePanel === 'settings'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icon name="tune" className="text-[18px]" />
              API 설정
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activePanel === 'guide'}
              onClick={() => setActivePanel('guide')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 font-h3 text-h3 transition-colors ${
                activePanel === 'guide'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icon name="menu_book" className="text-[18px]" />
              연결 가이드
            </button>
          </div>
        </div>

        {activePanel === 'guide' ? (
          <div className="max-h-[calc(90vh-8.5rem)] overflow-y-auto">
            <SupabaseConnectionGuide
              supabaseReady={supabaseReady}
              onGoToEdit={() => setActivePanel('settings')}
            />
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="max-h-[calc(90vh-8.5rem)] space-y-5 overflow-y-auto px-6 py-5">
            <section className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-low/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-h3 text-h3 text-on-surface">Supabase 연결</h3>
                  <p className="font-caption text-caption text-on-surface-variant">
                    Project URL과 anon public key만 저장하세요. service_role key는 브라우저에 저장하면 안 됩니다.
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 font-label text-label ${
                  supabaseReady ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                }`}>
                  {supabaseReady ? 'Connected' : 'Not connected'}
                </span>
              </div>

              <div className="space-y-2">
                <label className="font-h3 text-h3 text-on-surface" htmlFor="env-supabase-url">
                  Supabase Project URL
                </label>
                <input
                  id="env-supabase-url"
                  className="w-full rounded-lg border border-outline-variant bg-white px-4 py-2.5 font-mono text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={supabaseUrl}
                  onChange={(ev) => setSupabaseUrl(ev.target.value)}
                  placeholder="https://project-ref.supabase.co"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <label className="font-h3 text-h3 text-on-surface" htmlFor="env-supabase-anon">
                  Supabase Anon Public Key
                </label>
                <textarea
                  id="env-supabase-anon"
                  rows={3}
                  className="w-full rounded-lg border border-outline-variant bg-white px-4 py-2.5 font-mono text-[11px] leading-relaxed text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={supabaseAnonKey}
                  onChange={(ev) => setSupabaseAnonKey(ev.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIs..."
                  autoComplete="off"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-caption text-caption text-on-surface-variant">
                  {runtimeOverride ? '브라우저 저장 설정을 사용 중입니다.' : '.env 기본 설정을 사용 중입니다.'}
                </p>
                {runtimeOverride && (
                  <button
                    type="button"
                    onClick={() => {
                      clearRuntimeSupabaseConfig()
                      const fallback = getRuntimeSupabaseConfig()
                      setSupabaseUrl(fallback.url)
                      setSupabaseAnonKey(fallback.anonKey)
                      setRuntimeOverride(false)
                      setNeedsReload(true)
                    }}
                    className="rounded-lg border border-outline-variant px-3 py-2 font-label text-label text-on-surface hover:bg-surface-container-high"
                  >
                    로컬 설정 초기화
                  </button>
                )}
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-outline-variant bg-surface-container-low/40 p-4">
              <div>
                <h3 className="font-h3 text-h3 text-on-surface">API 설정</h3>
                <p className="font-caption text-caption text-on-surface-variant">
                  이 값은 Supabase의 ai_hub.environment_config에 저장됩니다.
                </p>
              </div>

              {supabaseReady && loadError && (
                <p className="rounded-lg border border-error/30 bg-error-container/30 px-3 py-2 font-caption text-error" role="alert">
                  불러오기 실패: {loadError}
                </p>
              )}

              {updatedAt && (
                <p className="font-caption text-on-surface-variant">
                  마지막 수정: {new Date(updatedAt).toLocaleString('ko-KR')}
                  {loading ? ' · 동기화 중' : ''}
                </p>
              )}

              <div className="space-y-2">
                <label className="font-h3 text-h3 text-on-surface" htmlFor="env-service-name">
                  서비스 표시 이름
                </label>
                <input
                  id="env-service-name"
                  className="w-full rounded-lg border border-outline-variant bg-white px-4 py-2.5 text-body font-body text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={serviceDisplayName}
                  onChange={(ev) => setServiceDisplayName(ev.target.value)}
                  placeholder="EBS AI 허브"
                />
              </div>

              <div className="space-y-2">
                <label className="font-h3 text-h3 text-on-surface" htmlFor="env-support-email">
                  지원 이메일
                </label>
                <input
                  id="env-support-email"
                  type="email"
                  className="w-full rounded-lg border border-outline-variant bg-white px-4 py-2.5 text-body font-body text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={supportEmail}
                  onChange={(ev) => setSupportEmail(ev.target.value)}
                  placeholder="support@company.ai"
                />
              </div>

              <div className="space-y-2">
                <label className="font-h3 text-h3 text-on-surface" htmlFor="env-api-url">
                  공개 API Base URL
                </label>
                <input
                  id="env-api-url"
                  className="w-full rounded-lg border border-outline-variant bg-white px-4 py-2.5 font-mono text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={publicApiBaseUrl}
                  onChange={(ev) => setPublicApiBaseUrl(ev.target.value)}
                  placeholder="https://api.example.com"
                />
              </div>

              <div className="space-y-2">
                <label className="font-h3 text-h3 text-on-surface" htmlFor="env-webhook">
                  통합 Webhook URL
                </label>
                <input
                  id="env-webhook"
                  className="w-full rounded-lg border border-outline-variant bg-white px-4 py-2.5 font-mono text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={integrationsWebhookUrl}
                  onChange={(ev) => setIntegrationsWebhookUrl(ev.target.value)}
                  placeholder="https://hooks.example.com/ai-hub"
                />
              </div>

              <div className="space-y-2">
                <label className="font-h3 text-h3 text-on-surface" htmlFor="env-notes">
                  관리자 메모
                </label>
                <textarea
                  id="env-notes"
                  rows={3}
                  className="w-full rounded-lg border border-outline-variant bg-white px-4 py-2.5 text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={adminNotes}
                  onChange={(ev) => setAdminNotes(ev.target.value)}
                  placeholder="운영 메모, 배포 채널, 연락처 등"
                />
              </div>
            </section>

            {needsReload && (
              <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-3 font-caption text-on-surface">
                <p className="mb-2">Supabase 연결 설정은 새로고침 후 적용됩니다.</p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 font-h3 text-h3 text-on-primary hover:opacity-90"
                >
                  <Icon name="refresh" className="text-[18px]" />
                  지금 새로고침
                </button>
              </div>
            )}

            {formError && (
              <p className="font-caption text-error" role="alert">
                {formError}
              </p>
            )}
            {savedOk && (
              <p className="font-caption text-success" role="status">
                저장되었습니다.
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-outline-variant pt-4">
              <button
                type="button"
                onClick={() => setActivePanel('guide')}
                className="rounded-lg border border-outline-variant px-4 py-2.5 font-h3 text-h3 text-on-surface hover:bg-surface-container-high"
              >
                연결 가이드
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-outline-variant px-4 py-2.5 font-h3 text-h3 text-on-surface hover:bg-surface-container-high"
              >
                닫기
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-primary px-5 py-2.5 font-h3 text-h3 text-on-primary hover:opacity-90 disabled:opacity-50"
              >
                {saving ? '저장 중' : '저장'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
