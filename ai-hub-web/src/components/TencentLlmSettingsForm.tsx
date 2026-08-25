import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { fetchEnvironmentConfig, saveEnvironmentConfig } from '../lib/environmentConfig'
import { patchAppAiSettings } from '../lib/appAiConfig'
import {
  DEFAULT_TENCENT_BASE_URL,
  MY_LLM_APP_ID,
  TENCENT_MODEL_CATALOG,
  TENCENT_PROVIDERS,
  mergeTencentModels,
  protocolFromApiUrl,
  tencentApiUrl,
  type TencentModelConfig,
  type TencentProviderId,
} from '../lib/tencentCatalog'
import { saveTencentPublicSettings } from '../lib/tencentSettings'
import { describeTencentKeyProblem, normalizeTencentApiKey } from '../lib/tencentApiKey'
import { issueTencentApiToken } from '../lib/tencentCreateToken'
import { testTencentConnection } from '../lib/tencentClient'
import type { EnvironmentPublicConfig } from '../types/environment'

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string }

type Props = {
  config: EnvironmentPublicConfig
  onSaved: () => Promise<void>
}

export default function TencentLlmSettingsForm({ config, onSaved }: Props) {
  const stored = config.ai_app_settings?.[MY_LLM_APP_ID] ?? config
  const initialModels = mergeTencentModels(stored.ai_tencent_models)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [baseUrl, setBaseUrl] = useState(stored.ai_tencent_base_url || DEFAULT_TENCENT_BASE_URL)
  const [models, setModels] = useState(initialModels)
  const [configured, setConfigured] = useState(Boolean(stored.ai_tencent_api_key_configured))
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const [providerFilter, setProviderFilter] = useState<TencentProviderId | 'all'>('all')
  const [secretId, setSecretId] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [subAppId, setSubAppId] = useState('')
  const [issuing, setIssuing] = useState(false)

  useEffect(() => {
    const next = config.ai_app_settings?.[MY_LLM_APP_ID] ?? config
    setApiKey('')
    setShowKey(false)
    setBaseUrl(next.ai_tencent_base_url || DEFAULT_TENCENT_BASE_URL)
    setModels(mergeTencentModels(next.ai_tencent_models))
    setConfigured(Boolean(next.ai_tencent_api_key_configured))
    setSaveError(null)
    setTest({ status: 'idle' })
    setSecretKey('')
  }, [config])

  const visibleModels = useMemo(
    () => (providerFilter === 'all' ? models : models.filter((model) => model.provider === providerFilter)),
    [models, providerFilter],
  )
  const enabledCount = models.filter((model) => model.enabled === true).length

  const persistLocal = (nextConfigured: boolean, nextModels: TencentModelConfig[], nextBaseUrl: string) => {
    saveTencentPublicSettings({
      configured: nextConfigured,
      baseUrl: nextBaseUrl,
      models: nextModels,
    })
  }

  const persistSettings = async (): Promise<{ ok: true; hasKey: boolean } | { ok: false; error: string }> => {
    const key = normalizeTencentApiKey(apiKey)
    const problem = key ? describeTencentKeyProblem(key) : null
    if (problem) return { ok: false, error: problem }
    const normalizedModels = mergeTencentModels(models)
    const nextBaseUrl = baseUrl.trim().replace(/\/+$/, '') || DEFAULT_TENCENT_BASE_URL
    persistLocal(Boolean(key) || configured, normalizedModels, nextBaseUrl)
    const { config: latest } = await fetchEnvironmentConfig()
    const result = await saveEnvironmentConfig(
      patchAppAiSettings(latest, MY_LLM_APP_ID, {
        ...(key ? { ai_tencent_api_key: key } : {}),
        ai_tencent_base_url: nextBaseUrl,
        ai_tencent_models: normalizedModels,
      }),
    )
    if (result.error) return { ok: false, error: `Tencent 설정 저장 실패: ${result.error.message}` }
    return { ok: true, hasKey: Boolean(key) || configured }
  }

  const handleSave = async () => {
    const result = await persistSettings()
    if (!result.ok) {
      setSaveError(result.error)
      return
    }
    setConfigured(result.hasKey)
    setApiKey('')
    setSaveError(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    await onSaved()
  }

  const handleClear = async () => {
    persistLocal(false, models, baseUrl)
    const { config: latest } = await fetchEnvironmentConfig()
    const result = await saveEnvironmentConfig(
      patchAppAiSettings(latest, MY_LLM_APP_ID, { ai_tencent_api_key_clear: true }),
    )
    if (result.error) {
      setSaveError(`Tencent 키 삭제 실패: ${result.error.message}`)
      return
    }
    setApiKey('')
    setConfigured(false)
    setSaveError(null)
    await onSaved()
  }

  const handleIssueToken = async () => {
    setIssuing(true)
    setSaveError(null)
    try {
      const result = await issueTencentApiToken({ secretId, secretKey, subAppId })
      if (!result.ok) {
        setSaveError(`Token 발급 실패: ${result.error}`)
        return
      }
      setSecretId('')
      setConfigured(true)
      setApiKey('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      setTest({
        status: 'ok',
        message: `ApiToken을 발급해 서버에만 저장했습니다 (${result.shape}). SecretKey는 저장하지 않습니다.`,
      })
      await onSaved()
    } finally {
      setSecretKey('')
      setIssuing(false)
    }
  }

  const handleTest = async () => {
    setTest({ status: 'testing' })
    if (apiKey.trim()) {
      const saved = await persistSettings()
      if (!saved.ok) {
        setTest({ status: 'error', message: saved.error })
        return
      }
      setConfigured(true)
      setApiKey('')
      setSaveError(null)
    } else if (!configured) {
      setTest({ status: 'error', message: '키를 입력한 뒤 테스트하세요.' })
      return
    }
    const res = await testTencentConnection()
    if (res.ok) {
      setTest({ status: 'ok', message: res.content.trim() })
    } else {
      setTest({ status: 'error', message: res.error })
    }
  }

  const resetCatalog = () => {
    setModels(mergeTencentModels(undefined))
    setBaseUrl(DEFAULT_TENCENT_BASE_URL)
  }

  const addCustomModel = () => {
    setModels((current) => [
      ...current,
      {
        id: '',
        label: '사용자 모델',
        provider: 'openai',
        protocol: 'completions',
        apiUrl: tencentApiUrl('completions', baseUrl),
        enabled: true,
      },
    ])
  }

  return (
    <div className="space-y-5">
      {saveError && <Notice tone="error" message={saveError} />}

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container">
        <div className="flex items-center gap-3 border-b border-outline-variant px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon name="vpn_key" className="text-[22px]" />
          </div>
          <div className="min-w-0">
            <h2 className="font-h3 text-h3 text-on-surface">Tencent API</h2>
            <p className="text-caption text-on-surface-variant">
              나만의 LLM은 Text LLM만 사용합니다. 키는{' '}
              <a
                href="https://doc.tencentpoc.com/justinkim/page#text"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Text Generation 문서
              </a>
              의 CreateAigcApiToken ApiToken입니다. 콘솔 API Keys의 SecretId(IKID)는 이미지/영상(MPS,
              mps.intl.tencentcloudapi.com)용이라 여기에 넣으면 401이 납니다.
            </p>
          </div>
          <StatusBadge configured={configured} />
        </div>

          <div className="space-y-5 px-5 py-5">
          <div className="hidden" aria-hidden="true">
            <p className="text-caption leading-relaxed text-on-surface-variant">
              SecretId/SecretKey는 이 화면에만 입력하세요. PowerShell <span className="font-mono">$env:</span> 나
              채팅에 붙이면 기록에 남습니다. 발급된 ApiToken만 서버에 저장하고, SecretKey는 저장하지 않습니다.
            </p>
            <Field label="SecretId" htmlFor="tencent-secret-id">
              <input
                id="tencent-secret-id"
                type="text"
                value={secretId}
                onChange={(event) => setSecretId(event.target.value)}
                placeholder="IKID로 시작하는 콘솔 API Key"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                name="tencent-cloud-secret-id"
                className="w-full rounded-lg border border-outline-variant bg-surface-container-high px-3 py-2.5 font-mono text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </Field>
            <Field label="SecretKey" htmlFor="tencent-secret-key">
              <input
                id="tencent-secret-key"
                type="password"
                value={secretKey}
                onChange={(event) => setSecretKey(event.target.value)}
                placeholder="콘솔에서 한 번만 보이는 SecretKey"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                name="tencent-cloud-secret-key"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                className="w-full rounded-lg border border-outline-variant bg-surface-container-high px-3 py-2.5 font-mono text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </Field>
            <Field label="SubAppId" htmlFor="tencent-sub-app-id">
              <input
                id="tencent-sub-app-id"
                type="text"
                inputMode="numeric"
                value={subAppId}
                onChange={(event) => setSubAppId(event.target.value.replace(/[^\d]/g, ''))}
                placeholder="VOD Application Management 숫자"
                autoComplete="off"
                spellCheck={false}
                name="tencent-sub-app-id"
                className="w-full rounded-lg border border-outline-variant bg-surface-container-high px-3 py-2.5 font-mono text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </Field>
            <button
              type="button"
              onClick={() => void handleIssueToken()}
              disabled={issuing || !secretId.trim() || !secretKey.trim() || !subAppId.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 font-label text-label text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon
                name={issuing ? 'progress_activity' : 'vpn_key'}
                className={`text-[18px] ${issuing ? 'animate-spin' : ''}`}
              />
              {issuing ? '발급 중...' : 'ApiToken 발급 후 저장'}
            </button>
          </div>

          <Field label="Tencent API 키" htmlFor="tencent-key">
            <div className="relative">
              <input
                id="tencent-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="CreateAigcApiToken AIGC API Token"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-outline-variant bg-surface-container-high py-2.5 pl-3 pr-10 font-mono text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-on-surface-variant hover:text-on-surface"
                aria-label={showKey ? '키 숨기기' : '키 보기'}
              >
                <Icon name={showKey ? 'visibility_off' : 'visibility'} className="text-[18px]" />
              </button>
            </div>
            {configured && !apiKey && (
              <p className="mt-1.5 text-caption text-on-surface-variant">
                이 앱에 Tencent 키가 저장되어 있습니다. 새 값을 입력하면 교체됩니다.
              </p>
            )}
            {!configured && (
              <p className="mt-1.5 text-caption text-on-surface-variant">
                “Tencent API 키” 같은 칸 이름은 넣지 말고, Token 문자열만 붙여넣으세요.
              </p>
            )}
          </Field>

          <Field label="Tencent API 베이스 URL" htmlFor="tencent-base">
            <input
              id="tencent-base"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder={DEFAULT_TENCENT_BASE_URL}
              className="w-full rounded-lg border border-outline-variant bg-surface-container-high px-3 py-2.5 font-mono text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
            <p className="mt-1 text-caption text-on-surface-variant">
              기본값: {DEFAULT_TENCENT_BASE_URL}. 모델별 API 주소는 아래에서 따로 바꿀 수 있습니다.
            </p>
          </Field>

          {test.status === 'ok' && <Notice tone="success" message={test.message} />}
          {test.status === 'error' && <Notice tone="error" message={test.message} />}

          <div className="flex flex-wrap items-center gap-2">
            <PrimaryButton icon="save" onClick={() => void handleSave()}>
              저장
            </PrimaryButton>
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={(!apiKey && !configured) || test.status === 'testing'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-high px-4 py-2.5 font-label text-label text-on-surface transition-colors hover:bg-surface-container-highest disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon
                name={test.status === 'testing' ? 'progress_activity' : 'wifi_tethering'}
                className={`text-[18px] ${test.status === 'testing' ? 'animate-spin' : ''}`}
              />
              {test.status === 'testing' ? '테스트 중...' : '연결 테스트'}
            </button>
            {configured && (
              <button
                type="button"
                onClick={() => void handleClear()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-error/30 bg-error/5 px-4 py-2.5 font-label text-label text-error hover:bg-error/10"
              >
                <Icon name="delete" className="text-[18px]" />
                키 삭제
              </button>
            )}
            {saved && (
              <span className="inline-flex items-center gap-1 text-caption text-success">
                <Icon name="check" className="text-[16px]" />
                저장되었습니다
              </span>
            )}
            <Link
              to="/dashboard"
              className="ml-auto inline-flex items-center gap-1.5 text-label text-primary hover:underline"
            >
              <Icon name="open_in_new" className="text-[16px]" />
              대시보드에서 사용
            </Link>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container">
        <div className="flex items-center gap-3 border-b border-outline-variant px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
            <Icon name="tune" className="text-[22px]" />
          </div>
          <div className="min-w-0">
            <h2 className="font-h3 text-h3 text-on-surface">모델 / API 주소</h2>
            <p className="text-caption text-on-surface-variant">
              Tencent 문서의 지원 모델 {TENCENT_MODEL_CATALOG.length}개를 등록했습니다. 「사용」을 켠 모델만 USER 화면 드롭다운에 나타납니다.
            </p>
          </div>
          <span className="ml-auto text-caption text-on-surface-variant">{enabledCount}개 사용</span>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value as TencentProviderId | 'all')}
              className="rounded-lg border border-outline-variant bg-surface-container-high px-3 py-2 text-body-sm"
              aria-label="제공사 필터"
            >
              <option value="all">전체 제공사</option>
              {TENCENT_PROVIDERS.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addCustomModel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 font-label text-label text-primary hover:bg-primary/10"
            >
              <Icon name="add" className="text-[17px]" />
              추가
            </button>
            <button
              type="button"
              onClick={() =>
                setModels((current) =>
                  current.map((model) =>
                    providerFilter === 'all' || model.provider === providerFilter
                      ? { ...model, enabled: true }
                      : model,
                  ),
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-high px-3 py-2 font-label text-label text-on-surface hover:bg-surface-container-highest"
            >
              현재 목록 켜기
            </button>
            <button
              type="button"
              onClick={() =>
                setModels((current) =>
                  current.map((model) =>
                    providerFilter === 'all' || model.provider === providerFilter
                      ? { ...model, enabled: false }
                      : model,
                  ),
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-high px-3 py-2 font-label text-label text-on-surface hover:bg-surface-container-highest"
            >
              현재 목록 끄기
            </button>
            <button
              type="button"
              onClick={resetCatalog}
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-high px-3 py-2 font-label text-label text-on-surface hover:bg-surface-container-highest"
            >
              <Icon name="restart_alt" className="text-[17px]" />
              문서 기본값으로 되돌리기
            </button>
          </div>

          <div className="space-y-2">
            {visibleModels.map((model) => {
              const index = models.findIndex((item) => item === model)
              return (
                <div
                  key={`${model.id}-${index}`}
                  className="grid gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-3 md:grid-cols-[auto_140px_1fr_minmax(0,1.6fr)_auto]"
                >
                  <label className="flex items-center gap-2 text-caption text-on-surface">
                    <input
                      type="checkbox"
                      checked={model.enabled}
                      onChange={(event) =>
                        setModels((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, enabled: event.target.checked } : item,
                          ),
                        )
                      }
                      aria-label={`${model.label} 사용`}
                    />
                    사용
                  </label>
                  <select
                    value={model.provider}
                    onChange={(event) =>
                      setModels((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, provider: event.target.value as TencentProviderId }
                            : item,
                        ),
                      )
                    }
                    className="rounded-lg border border-outline-variant bg-surface-container-high px-2 py-2 text-body-sm"
                    aria-label={`${model.label} 제공사`}
                  >
                    {TENCENT_PROVIDERS.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={model.id}
                    onChange={(event) =>
                      setModels((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, id: event.target.value, label: event.target.value || item.label } : item,
                        ),
                      )
                    }
                    placeholder="모델 ID"
                    className="rounded-lg border border-outline-variant bg-surface-container-high px-3 py-2 font-mono text-body-sm"
                    aria-label={`${model.label} 모델 ID`}
                  />
                  <input
                    value={model.apiUrl}
                    onChange={(event) =>
                      setModels((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                apiUrl: event.target.value,
                                protocol: protocolFromApiUrl(event.target.value),
                              }
                            : item,
                        ),
                      )
                    }
                    placeholder={tencentApiUrl(model.protocol, baseUrl)}
                    className="rounded-lg border border-outline-variant bg-surface-container-high px-3 py-2 font-mono text-caption"
                    aria-label={`${model.label} API 주소`}
                  />
                  {TENCENT_MODEL_CATALOG.some((item) => item.id === model.id) ? (
                    <span className="text-caption text-on-surface-variant self-center">{model.protocol}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setModels((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error"
                      aria-label="모델 삭제"
                    >
                      <Icon name="delete" className="text-[18px]" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-caption text-on-surface-variant">
            Completions는 <span className="font-mono">/v1/chat/completions</span>, GPT 일부 모델은{' '}
            <span className="font-mono">/v1/responses</span>, Claude는{' '}
            <span className="font-mono">/v1/messages</span>가 기본입니다. 켜 둔 모델만 나만의 LLM에서 선택할 수 있습니다.
          </div>
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-5 py-3">
        <Icon name="lock" className="mt-0.5 shrink-0 text-[18px] text-on-surface-variant" />
        <p className="text-caption leading-relaxed text-on-surface-variant">
          API 키는 서버에만 저장됩니다. 모델 목록과 API 주소는 USER 포털의 나만의 LLM에 반영됩니다.
        </p>
      </div>
    </div>
  )
}

function StatusBadge({ configured }: { configured: boolean }) {
  return (
    <span
      className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 font-label text-label ${
        configured
          ? 'border-success/30 bg-success/10 text-success'
          : 'border-outline-variant bg-surface-container-highest text-on-surface-variant'
      }`}
    >
      <Icon name={configured ? 'check_circle' : 'cancel'} className="text-[16px]" />
      {configured ? '설정됨' : '미설정'}
    </span>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block font-label text-label text-on-surface" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  )
}

function PrimaryButton({
  icon,
  onClick,
  children,
}: {
  icon: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 font-label text-label text-on-primary transition-colors hover:bg-primary/90"
    >
      <Icon name={icon} className="text-[18px]" />
      {children}
    </button>
  )
}

function Notice({ tone, message }: { tone: 'success' | 'error'; message: string }) {
  const success = tone === 'success'
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-body-sm ${
        success
          ? 'border-success/30 bg-success/5 text-success'
          : 'border-error/30 bg-error/5 text-error'
      }`}
    >
      <Icon name={success ? 'check_circle' : 'error'} className="mt-0.5 shrink-0 text-[18px]" />
      <span>{message}</span>
    </div>
  )
}
