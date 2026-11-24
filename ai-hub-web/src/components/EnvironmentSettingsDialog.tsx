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
  const { config, refetch, supabaseReady, error: loadError } =
    useEnvironmentConfig()

  const [serviceDisplayName, setServiceDisplayName] = useState('')
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('')
  const [runtimeOverride, setRuntimeOverride] = useState(false)
  const [showSupabaseDetails, setShowSupabaseDetails] = useState(false)
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
    setShowSupabaseDetails(!supabaseReady)
    setServiceDisplayName(config.service_display_name ?? '')
    setActivePanel('settings')
  }, [open, config, supabaseReady])

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
              <Icon name="admin_panel_settings" className="text-primary text-[19.2px]" />
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
              <Icon name="tune" className="text-[14.4px]" />
              일반 설정
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
              <Icon name="menu_book" className="text-[14.4px]" />
              연결 가이드
            </button>
          </div>
        </div>

        {activePanel === 'guide' ? (
          <div className="max-h-[calc(90vh-8.5rem)] overflow-y-auto">
            <SupabaseConnectionGuide
              supabaseReady={supabaseReady}
              onGoToEdit={() => {
                setActivePanel('settings')
                setShowSupabaseDetails(true)
              }}
            />
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="max-h-[calc(90vh-8.5rem)] space-y-5 overflow-y-auto px-6 py-5">
            <section className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-low/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-h3 text-h3 text-on-surface">Supabase 연결</h3>
                  <p className="font-caption text-caption text-on-surface-variant">
                    {supabaseReady
                      ? '연결되어 있습니다. 상세 연결 정보는 기본 화면에서 숨겼습니다.'
                      : '초기 연결에 필요한 Project URL과 공개 키를 입력하세요. service_role 키는 입력하지 마세요.'}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 font-label text-label ${
                  supabaseReady ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                }`}>
                  {supabaseReady ? 'Connected' : 'Not connected'}
                </span>
              </div>

              {supabaseReady && (
                <button
                  type="button"
                  aria-expanded={showSupabaseDetails}
                  onClick={() => setShowSupabaseDetails((value) => !value)}
                  className="rounded-lg border border-outline-variant px-3 py-2 font-label text-label text-on-surface hover:bg-surface-container-high"
                >
                  {showSupabaseDetails ? '연결 정보 숨기기' : '고급 연결 설정'}
                </button>
              )}

              {(!supabaseReady || showSupabaseDetails) && (
                <div className="space-y-4">
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
                      Supabase 공개 키 (anon/publishable)
                    </label>
                    <input
                      id="env-supabase-anon"
                      type="password"
                      className="w-full rounded-lg border border-outline-variant bg-white px-4 py-2.5 font-mono text-body-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={supabaseAnonKey}
                      onChange={(ev) => setSupabaseAnonKey(ev.target.value)}
                      placeholder="Supabase 공개 키를 입력하세요"
                      autoComplete="new-password"
                      spellCheck={false}
                    />
                    <p className="font-caption text-caption text-on-surface-variant">
                      공개 키는 브라우저용 식별자이며 service_role 키와 다릅니다. 입력란은 화면에서 가려 표시합니다.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-caption text-caption text-on-surface-variant">
                      {runtimeOverride ? '이 브라우저에 별도 연결 설정이 저장되어 있습니다.' : '배포 기본 연결 설정을 사용 중입니다.'}
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
                        브라우저 설정 초기화
                      </button>
                    )}
                  </div>
                </div>)}
            </section>

            <section className="space-y-4 rounded-xl border border-outline-variant bg-surface-container-low/40 p-4">
              <div>
                <h3 className="font-h3 text-h3 text-on-surface">공통 표시 설정</h3>
                <p className="font-caption text-caption text-on-surface-variant">
                  실제 API 키와 모델 연결은 앱별 설정에서 관리합니다.
                </p>
              </div>

              {supabaseReady && loadError && (
                <p className="rounded-lg border border-error/30 bg-error-container/30 px-3 py-2 font-caption text-error" role="alert">
                  불러오기 실패: {loadError}
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

            </section>

            {needsReload && (
              <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-3 font-caption text-on-surface">
                <p className="mb-2">Supabase 연결 설정은 새로고침 후 적용됩니다.</p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 font-h3 text-h3 text-on-primary hover:opacity-90"
                >
                  <Icon name="refresh" className="text-[14.4px]" />
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
