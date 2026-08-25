import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { getAiSettings, isAiConfigured, subscribeAiSettings } from '../lib/aiSettings'
import { chatComplete, type ChatMessage } from '../lib/openaiClient'
import { getCurrentAuthSession } from '../lib/userScopedStorage'

const SYSTEM_PROMPT: ChatMessage = {
  role: 'system',
  content:
    'You are Codex, a concise coding assistant inside EBS AI 허브. ' +
    'Answer in the user\'s language (Korean if they write Korean). ' +
    'Prefer clear explanations and well-formatted code blocks.',
}

type ChatItem = { role: 'user' | 'assistant'; content: string }

const APP_ID = 'codex'

export default function CodexWidget() {
  const [configured, setConfigured] = useState(() => getCurrentAuthSession()?.role === 'user' || isAiConfigured(APP_ID))
  const [model, setModel] = useState(() => getAiSettings(APP_ID).model)
  const [messages, setMessages] = useState<ChatItem[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return subscribeAiSettings(() => {
      setConfigured(getCurrentAuthSession()?.role === 'user' || isAiConfigured(APP_ID))
      setModel(getAiSettings(APP_ID).model)
    })
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setError(null)
    const nextMessages: ChatItem[] = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    const res = await chatComplete(
      [
        SYSTEM_PROMPT,
        ...nextMessages.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
      ],
      { model, appId: APP_ID },
    )
    setLoading(false)
    if (res.ok) {
      setMessages((prev) => [...prev, { role: 'assistant', content: res.content }])
    } else {
      setError(res.error)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void send()
    }
  }

  if (!configured) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
          <Icon name="key" className="text-[26px]" />
        </div>
        <p className="text-body-sm text-on-surface-variant max-w-[260px]">
          Codex를 사용하려면 OpenAI API 키가 필요합니다. 설정에서 키를 입력해 연동하세요.
        </p>
        <Link
          to={`/settings?app=${APP_ID}`}
          className="no-drag inline-flex items-center gap-1.5 rounded-lg bg-primary text-on-primary px-4 py-2 font-label text-label hover:bg-primary/90 transition-colors"
        >
          <Icon name="settings" className="text-[18px]" />
          설정에서 API 키 입력
        </Link>
      </div>
    )
  }

  return (
    <div className="no-drag h-full flex flex-col">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto space-y-3 pr-1">
        {messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-on-surface-variant">
            <Icon name="smart_toy" className="text-[28px] text-primary" />
            <p className="text-body-sm">코드, 버그, 설계에 대해 무엇이든 물어보세요.</p>
            <p className="text-caption">모델: {model}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-body-sm whitespace-pre-wrap break-words ${
                m.role === 'user'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-high text-on-surface border border-outline-variant'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg px-3 py-2 bg-surface-container-high border border-outline-variant text-on-surface-variant text-body-sm inline-flex items-center gap-2">
              <Icon name="progress_activity" className="text-[16px] animate-spin" />
              생각 중...
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-caption text-error">
          <Icon name="error" className="text-[16px] shrink-0 mt-0.5" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      <div className="mt-2 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="메시지를 입력하세요 (Ctrl+Enter 전송)"
          rows={2}
          className="no-drag flex-1 resize-none bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary/25 focus:outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={!input.trim() || loading}
          className="no-drag shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="전송"
        >
          <Icon name="send" className="text-[18px]" />
        </button>
      </div>
    </div>
  )
}
