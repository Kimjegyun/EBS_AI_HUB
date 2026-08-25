import { useState } from 'react'
import { Icon } from '../components/Icon'
import { chatComplete } from '../lib/openaiClient'
import { getUserScopedItem, setUserScopedItem } from '../lib/userScopedStorage'
import type { AppPlugin } from './types'

const DRAFT_KEY = 'email-writer-draft'
const APP_ID = 'email-writer'

type MailResult = {
  subject: string
  body: string
}

function parseMailResult(content: string): MailResult {
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned) as { subject?: unknown; body?: unknown }
    if (typeof parsed.subject === 'string' && typeof parsed.body === 'string') {
      return { subject: parsed.subject.trim(), body: parsed.body.trim() }
    }
  } catch {
    // Fall back to a readable plain-text result when the model does not return JSON.
  }
  return { subject: '', body: cleaned }
}

function EmailWriterBody() {
  const [draft, setDraft] = useState(() => getUserScopedItem(DRAFT_KEY) ?? '')
  const [recipient, setRecipient] = useState('')
  const [purpose, setPurpose] = useState('업무 요청')
  const [tone, setTone] = useState('정중하고 간결하게')
  const [result, setResult] = useState<MailResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<'subject' | 'body' | 'all' | null>(null)

  const updateDraft = (value: string) => {
    setDraft(value)
    setUserScopedItem(DRAFT_KEY, value)
  }

  const generate = async () => {
    if (!draft.trim() || loading) return
    setLoading(true)
    setError('')
    setCopied(null)

    const response = await chatComplete(
      [
        {
          role: 'system',
          content:
            '당신은 한국어 비즈니스 메일 작성 전문가입니다. 사용자의 러프한 메모를 바로 발송할 수 있는 자연스러운 메일로 정리하세요. 메모에 없는 날짜, 수치, 약속, 이름은 지어내지 마세요. 핵심 요청과 다음 행동이 분명해야 하며, 문단을 짧게 나누세요. 반드시 {"subject":"메일 제목","body":"메일 본문"} 형식의 유효한 JSON만 출력하세요. 본문에는 제목을 반복하지 마세요.',
        },
        {
          role: 'user',
          content: `수신자: ${recipient.trim() || '지정되지 않음'}\n메일 용도: ${purpose}\n말투: ${tone}\n\n러프한 내용:\n${draft.trim()}`,
        },
      ],
      { appId: APP_ID },
    )

    if (response.ok) setResult(parseMailResult(response.content))
    else setError(response.error)
    setLoading(false)
  }

  const copy = async (part: 'subject' | 'body' | 'all') => {
    if (!result) return
    const text =
      part === 'subject'
        ? result.subject
        : part === 'body'
          ? result.body
          : `${result.subject ? `제목: ${result.subject}\n\n` : ''}${result.body}`
    await navigator.clipboard.writeText(text)
    setCopied(part)
    window.setTimeout(() => setCopied(null), 1600)
  }

  return (
    <div className="no-drag flex h-full min-h-[360px] flex-col gap-3 overflow-auto">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <label className="flex flex-col gap-1 font-label text-label text-on-surface-variant">
          수신자 (선택)
          <input
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="예: 김대리님, 협력사 담당자"
            className="rounded-lg border-outline-variant bg-surface-container-low px-3 py-2 text-body text-on-surface placeholder:text-outline focus:border-primary focus:ring-primary"
          />
        </label>
        <label className="flex flex-col gap-1 font-label text-label text-on-surface-variant">
          메일 용도
          <select
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            className="rounded-lg border-outline-variant bg-surface-container-low px-3 py-2 text-body text-on-surface focus:border-primary focus:ring-primary"
          >
            {['업무 요청', '보고·공유', '일정 조율', '문의', '안내', '감사·회신'].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-label text-label text-on-surface-variant">
          말투
          <select
            value={tone}
            onChange={(event) => setTone(event.target.value)}
            className="rounded-lg border-outline-variant bg-surface-container-low px-3 py-2 text-body text-on-surface focus:border-primary focus:ring-primary"
          >
            {['정중하고 간결하게', '친근하고 부드럽게', '격식 있고 공식적으로', '단호하고 명확하게'].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="flex min-h-[190px] flex-col rounded-xl border border-outline-variant bg-surface-container-low p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-h3 text-h3 text-on-surface">러프한 내용</span>
            {draft && (
              <button type="button" onClick={() => updateDraft('')} className="text-caption text-on-surface-variant hover:text-error">
                비우기
              </button>
            )}
          </div>
          <textarea
            value={draft}
            onChange={(event) => updateDraft(event.target.value)}
            placeholder="전달할 내용을 편하게 적어주세요.\n예: 다음 주 화요일 회의 자료 월요일 오전까지 보내달라고 요청. 지난 자료 양식 참고."
            className="min-h-[130px] flex-1 resize-none rounded-lg border-0 bg-white p-3 text-body text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/30"
          />
        </section>

        <section className="flex min-h-[190px] flex-col rounded-xl border border-outline-variant bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-h3 text-h3 text-on-surface">완성된 메일</span>
            {result && (
              <button type="button" onClick={() => copy('all')} className="inline-flex items-center gap-1 text-caption font-medium text-primary hover:text-primary-dark">
                <Icon name={copied === 'all' ? 'check' : 'content_copy'} className="text-[15px]" />
                {copied === 'all' ? '복사됨' : '전체 복사'}
              </button>
            )}
          </div>
          {result ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
              <div className="rounded-lg bg-surface-container-low p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-label text-label text-on-surface-variant">제목</span>
                  <button type="button" onClick={() => copy('subject')} aria-label="제목 복사" className="text-on-surface-variant hover:text-primary">
                    <Icon name={copied === 'subject' ? 'check' : 'content_copy'} className="text-[15px]" />
                  </button>
                </div>
                <p className="font-h3 text-h3 text-on-surface">{result.subject || '제목 없음'}</p>
              </div>
              <div className="relative min-h-[110px] flex-1 whitespace-pre-wrap rounded-lg bg-surface-container-low p-3 pr-9 text-body text-on-surface">
                <button type="button" onClick={() => copy('body')} aria-label="본문 복사" className="absolute right-3 top-3 text-on-surface-variant hover:text-primary">
                  <Icon name={copied === 'body' ? 'check' : 'content_copy'} className="text-[15px]" />
                </button>
                {result.body}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-on-surface-variant">
              <Icon name="drafts" className="text-4xl text-outline" />
              <p className="text-body-sm">내용을 입력하고 메일 생성을 눌러주세요.</p>
            </div>
          )}
        </section>
      </div>

      {error && <p role="alert" className="rounded-lg bg-error-container px-3 py-2 text-body-sm text-error">{error}</p>}
      <button
        type="button"
        onClick={generate}
        disabled={!draft.trim() || loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-h3 text-h3 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Icon name={loading ? 'progress_activity' : 'auto_awesome'} className={`text-[18px] ${loading ? 'animate-spin' : ''}`} />
        {loading ? '메일을 정리하는 중...' : result ? '다시 생성하기' : '메일 생성하기'}
      </button>
    </div>
  )
}

export const emailWriterApp: AppPlugin = {
  id: 'email-writer',
  name: '메일 생성기',
  icon: 'edit_note',
  description: '러프하게 적은 내용을 바로 보낼 수 있는 제목과 메일 본문으로 정리합니다.',
  category: 'AI',
  version: '1.0.0',
  defaultSize: { w: 8, h: 6, minW: 5, minH: 4 },
  Body: EmailWriterBody,
}
