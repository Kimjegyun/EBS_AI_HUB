import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { authHeaders } from '../lib/authHeaders'
import { fetchEnvironmentConfig, saveEnvironmentConfig } from '../lib/environmentConfig'
import { patchAppAiSettings } from '../lib/appAiConfig'
import type { EnvironmentPublicConfig } from '../types/environment'

const APP_ID = 'voice-summary'
const DEFAULT_BASE_URL = 'https://api.together.ai/v1'
const DEFAULT_MODEL = 'openai/whisper-large-v3'
const DEFAULT_SUMMARY_MODEL = 'MiniMaxAI/MiniMax-M3'

export default function TogetherSttSettingsForm({ config, onSaved }: { config: EnvironmentPublicConfig; onSaved: () => Promise<void> }) {
  const stored = config.ai_app_settings?.[APP_ID] ?? {}
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [baseUrl, setBaseUrl] = useState(stored.ai_together_base_url || DEFAULT_BASE_URL)
  const [model, setModel] = useState(stored.ai_together_stt_model || DEFAULT_MODEL)
  const [summaryModel, setSummaryModel] = useState(stored.ai_together_summary_model || DEFAULT_SUMMARY_MODEL)
  const [configured, setConfigured] = useState(Boolean(stored.ai_together_api_key_configured))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const next = config.ai_app_settings?.[APP_ID] ?? {}
    // 저장 후 서버 공개 설정으로 입력 상태를 다시 동기화합니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApiKey('')
    setBaseUrl(next.ai_together_base_url || DEFAULT_BASE_URL)
    setModel(next.ai_together_stt_model || DEFAULT_MODEL)
    setSummaryModel(next.ai_together_summary_model || DEFAULT_SUMMARY_MODEL)
    setConfigured(Boolean(next.ai_together_api_key_configured))
  }, [config])

  const save = async () => {
    setBusy(true)
    setMessage(null)
    const key = apiKey.trim()
    if (key && !/^[\x21-\x7E]+$/.test(key)) {
      setMessage({ ok: false, text: 'API 키에 한글, 공백 또는 줄바꿈이 포함되어 있습니다. 키 문자열만 다시 붙여 넣어 주세요.' })
      setBusy(false)
      return false
    }
    const current = await fetchEnvironmentConfig()
    if (current.error) {
      setMessage({ ok: false, text: `기존 설정을 읽지 못했습니다: ${current.error.message}` })
      setBusy(false)
      return false
    }
    const result = await saveEnvironmentConfig(patchAppAiSettings(current.config, APP_ID, {
      ...(key ? { ai_together_api_key: key } : {}),
      ai_together_base_url: baseUrl.trim().replace(/\/+$/, '') || DEFAULT_BASE_URL,
      ai_together_stt_model: model.trim() || DEFAULT_MODEL,
      ai_together_summary_model: summaryModel.trim() || DEFAULT_SUMMARY_MODEL,
    }))
    if (result.error) {
      setMessage({ ok: false, text: `설정 저장 실패: ${result.error.message}` })
      setBusy(false)
      return false
    }
    setConfigured(Boolean(key) || configured)
    setApiKey('')
    await onSaved()
    setBusy(false)
    return true
  }

  const test = async () => {
    setBusy(true)
    setMessage(null)
    if (apiKey.trim() && !(await save())) return
    if (!apiKey.trim() && !configured) {
      setMessage({ ok: false, text: 'Together AI API 키를 입력하세요.' })
      setBusy(false)
      return
    }
    const response = await fetch('/api/ai/together-test', { method: 'POST', headers: authHeaders() })
    const body = await response.json().catch(() => null) as { text?: string; error?: string } | null
    setMessage({ ok: response.ok, text: response.ok ? body?.text || '연결 성공' : body?.error || `연결 실패 (${response.status})` })
    setBusy(false)
  }

  const clear = async () => {
    setBusy(true)
    const current = await fetchEnvironmentConfig()
    if (!current.error) {
      await saveEnvironmentConfig(patchAppAiSettings(current.config, APP_ID, { ai_together_api_key_clear: true }))
      setConfigured(false)
      setApiKey('')
      await onSaved()
      setMessage({ ok: true, text: 'Together AI API 키를 삭제했습니다.' })
    }
    setBusy(false)
  }

  const field = 'w-full rounded-lg border border-outline-variant bg-white px-3 py-2 text-body text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/10'
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl bg-primary/5 p-3">
        <Icon name="record_voice_over" className="mt-0.5 text-[22px] text-primary" />
        <div className="min-w-0 flex-1"><p className="font-medium text-on-surface">Together AI Speech-to-Text</p><p className="text-caption text-on-surface-variant">Whisper Large v3로 M4A 등 최대 50MB 음성 파일을 전사합니다. API 키는 암호화되어 서버에만 저장됩니다.</p></div>
        <span className={`rounded-full px-2 py-1 text-caption ${configured ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>{configured ? '설정됨' : '미설정'}</span>
      </div>
      <label className="block"><span className="mb-1 block text-caption text-on-surface-variant">Together API Key</span><div className="flex gap-2"><input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={configured ? '새 키를 입력할 때만 작성' : 'Together API 키 입력'} autoComplete="new-password" className={field} /><button type="button" onClick={() => setShowKey((v) => !v)} className="rounded-lg border border-outline-variant px-3 text-on-surface-variant"><Icon name={showKey ? 'visibility_off' : 'visibility'} /></button></div></label>
      <div className="grid gap-3 md:grid-cols-3"><label><span className="mb-1 block text-caption text-on-surface-variant">API 기본 주소</span><input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={field} /></label><label><span className="mb-1 block text-caption text-on-surface-variant">STT 모델</span><input value={model} onChange={(e) => setModel(e.target.value)} className={field} /></label><label><span className="mb-1 block text-caption text-on-surface-variant">요약 모델</span><input value={summaryModel} onChange={(e) => setSummaryModel(e.target.value)} className={field} /></label></div>
      {message && <p className={`rounded-lg px-3 py-2 text-body-sm ${message.ok ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>{message.text}</p>}
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void save().then((ok) => ok && setMessage({ ok: true, text: 'Together AI 설정을 저장했습니다.' }))} className="rounded-lg bg-primary px-4 py-2 font-medium text-white disabled:opacity-50">저장</button><button type="button" disabled={busy} onClick={() => void test()} className="rounded-lg border border-primary px-4 py-2 font-medium text-primary disabled:opacity-50">저장 후 연결 테스트</button>{configured && <button type="button" disabled={busy} onClick={() => void clear()} className="rounded-lg px-3 py-2 text-error disabled:opacity-50">키 삭제</button>}</div>
      <a href="https://api.together.ai/settings/api-keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-caption text-primary hover:underline">Together AI에서 API 키 만들기 <Icon name="open_in_new" className="text-[14px]" /></a>
    </div>
  )
}
